const { google } = require('googleapis');
const path = require('path');
const pool = require('../config/database');
const { sendInterviewSlotBookedNotification } = require('./email');

class CalendarService {
  constructor() {
    this.auth = null;
    this.calendar = null;
    this.initializeAuth();
  }

  async initializeAuth() {
    try {
      // Load service account credentials
      // In production, use mounted secret file, in development use local file
      const keyFile = process.env.NODE_ENV === 'production'
        ? '/secrets/key.json'
        : path.join(__dirname, '../key.json');
      const fs = require('fs');

      // Check if key file exists
      if (!fs.existsSync(keyFile)) {
        console.warn('⚠️ Google service account key file not found at:', keyFile);
        console.warn('Calendar features will be disabled until key file is provided');
        return;
      }

      // Load the service account key for domain-wide delegation
      const keyData = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
      this.serviceAccountKey = keyData;

      // Set up API key from environment
      this.apiKey = process.env.GOOGLE_SHEETS_API_KEY;
      if (!this.apiKey) {
        console.warn('⚠️ GOOGLE_SHEETS_API_KEY not found in environment variables');
      }

      this.auth = new google.auth.GoogleAuth({
        keyFile: keyFile,
        scopes: [
          'https://www.googleapis.com/auth/calendar',
          'https://www.googleapis.com/auth/calendar.events',
          'https://www.googleapis.com/auth/calendar.readonly'
        ]
      });

      this.calendar = google.calendar({ version: 'v3', auth: this.auth });
      console.log('✅ Google Calendar API initialized successfully');
      console.log('✅ Service Account Email:', keyData.client_email);
      console.log('✅ API Key configured:', this.apiKey ? 'Yes' : 'No');
    } catch (error) {
      console.error('❌ Failed to initialize Google Calendar API:', error);
      console.warn('Calendar features will be disabled');
      // Don't throw error to prevent server from crashing
    }
  }

  // Create JWT client for domain-wide delegation
  createJWTClient(userEmail) {
    if (!this.serviceAccountKey) {
      throw new Error('Service account key not loaded');
    }

    console.log(`Creating JWT client for domain-wide delegation: ${userEmail}`);

    const jwtClient = new google.auth.JWT({
      email: this.serviceAccountKey.client_email,
      key: this.serviceAccountKey.private_key,
      scopes: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/calendar.readonly'
      ],
      subject: userEmail // This is the subject for domain-wide delegation
    });

    return jwtClient;
  }

  async getCalendarConfig() {
    const result = await pool.query('SELECT * FROM calendar_config ORDER BY id DESC LIMIT 1');
    if (result.rows.length === 0) {
      throw new Error('Calendar configuration not found');
    }
    return result.rows[0];
  }


  async getInterviewerEmails(interviewerIds) {
    const result = await pool.query(
      'SELECT id, email FROM users WHERE id = ANY($1)',
      [interviewerIds]
    );
    return result.rows;
  }

  async getCommonAvailableSlots(interviewerIds, startDate, endDate, duration = 60) {
    try {
      if (!this.calendar) {
        console.warn('Calendar API not initialized, returning mock slots');
        // Return mock slots for testing when calendar is not available
        return this.generateTimeSlots(startDate, endDate, duration).slice(0, 10);
      }

      const interviewers = await this.getInterviewerEmails(interviewerIds);

      // Get busy times for all interviewers
      const busyTimes = await Promise.all(
        interviewers.map(interviewer => this.getInterviewerBusyTimes(interviewer.email, startDate, endDate))
      );

      // Generate time slots
      const slots = this.generateTimeSlots(startDate, endDate, duration);

      // Filter out busy slots
      const availableSlots = slots.filter(slot => {
        return busyTimes.every(interviewerBusy => {
          return !this.isSlotConflicting(slot, interviewerBusy);
        });
      });

      // Check against existing bookings in our database
      const dbBookedSlots = await this.getExistingBookings(startDate, endDate);
      const finalAvailableSlots = availableSlots.filter(slot => {
        return !this.isSlotConflicting(slot, dbBookedSlots);
      });

      return finalAvailableSlots;
    } catch (error) {
      console.error('Error getting available slots:', error);
      throw error;
    }
  }

  async getInterviewerBusyTimes(email, startDate, endDate) {
    try {
      console.log(`Getting busy times for ${email} using domain-wide delegation`);

      // Create JWT client for this specific user with domain-wide delegation
      const jwtClient = this.createJWTClient(email);
      const calendar = google.calendar({
        version: 'v3',
        auth: jwtClient,
        key: this.apiKey
      });

      // Get busy times from Google Calendar
      const response = await calendar.freebusy.query({
        requestBody: {
          timeMin: startDate.toISOString(),
          timeMax: endDate.toISOString(),
          items: [{ id: email }]
        }
      });

      const googleBusyTimes = response.data.calendars[email]?.busy || [];
      console.log(`✅ Found ${googleBusyTimes.length} busy times in Google Calendar for ${email}`);

      // Also check our database for existing interview bookings
      const result = await pool.query(`
        SELECT scheduled_time, 
               scheduled_time + INTERVAL '1 hour' as end_time
        FROM candidate_rounds cr
        JOIN interview_assignments ia ON cr.candidate_id = ia.candidate_id AND cr.round_id = ia.round_id
        JOIN users u ON ia.interviewer_id = u.id
        WHERE u.email = $1 
        AND cr.scheduled_time IS NOT NULL 
        AND cr.scheduled_time >= $2 
        AND cr.scheduled_time <= $3
      `, [email, startDate, endDate]);

      const dbBusyTimes = result.rows.map(row => ({
        start: new Date(row.scheduled_time),
        end: new Date(row.end_time)
      }));

      console.log(`✅ Found ${dbBusyTimes.length} existing interview bookings for ${email}`);

      // Combine Google Calendar busy times with database bookings
      const allBusyTimes = [
        ...googleBusyTimes.map(busy => ({
          start: new Date(busy.start),
          end: new Date(busy.end)
        })),
        ...dbBusyTimes
      ];

      console.log(`✅ Total busy times for ${email}: ${allBusyTimes.length}`);

      // Log busy times for debugging
      if (allBusyTimes.length > 0) {
        console.log(`📅 Busy periods for ${email}:`);
        allBusyTimes.forEach((busy, index) => {
          console.log(`   ${index + 1}. ${busy.start.toLocaleString()} - ${busy.end.toLocaleString()}`);
        });
      }

      return allBusyTimes;
    } catch (error) {
      console.error(`❌ Error getting busy times for ${email}:`, error.message);
      console.error('Falling back to database-only check');

      // Fallback to database-only check
      try {
        const result = await pool.query(`
          SELECT scheduled_time, 
                 scheduled_time + INTERVAL '1 hour' as end_time
          FROM candidate_rounds cr
          JOIN interview_assignments ia ON cr.candidate_id = ia.candidate_id AND cr.round_id = ia.round_id
          JOIN users u ON ia.interviewer_id = u.id
          WHERE u.email = $1 
          AND cr.scheduled_time IS NOT NULL 
          AND cr.scheduled_time >= $2 
          AND cr.scheduled_time <= $3
        `, [email, startDate, endDate]);

        return result.rows.map(row => ({
          start: new Date(row.scheduled_time),
          end: new Date(row.end_time)
        }));
      } catch (dbError) {
        console.error('Database fallback also failed:', dbError);
        return [];
      }
    }
  }

  async getExistingBookings(startDate, endDate) {
    const result = await pool.query(`
      SELECT scheduled_time, scheduled_time + INTERVAL '1 hour' as end_time
      FROM candidate_rounds 
      WHERE scheduled_time IS NOT NULL 
      AND scheduled_time >= $1 
      AND scheduled_time <= $2
    `, [startDate, endDate]);

    return result.rows.map(row => ({
      start: new Date(row.scheduled_time),
      end: new Date(row.end_time)
    }));
  }

  // Check if a date is a Japanese public holiday
  isJapanesePublicHoliday(date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // JavaScript months are 0-indexed
    const day = date.getDate();

    // Fixed holidays
    const fixedHolidays = [
      { month: 1, day: 1 },   // New Year's Day
      { month: 2, day: 11 },  // National Foundation Day
      { month: 2, day: 23 },  // Emperor's Birthday
      { month: 4, day: 29 },  // Showa Day
      { month: 5, day: 3 },   // Constitution Memorial Day
      { month: 5, day: 4 },   // Greenery Day
      { month: 5, day: 5 },   // Children's Day
      { month: 8, day: 11 },  // Mountain Day
      { month: 11, day: 3 },  // Culture Day
      { month: 11, day: 23 }, // Labor Thanksgiving Day
    ];

    // Check fixed holidays
    if (fixedHolidays.some(h => h.month === month && h.day === day)) {
      return true;
    }

    // Variable holidays (simplified calculation)
    // Coming of Age Day (2nd Monday of January)
    if (month === 1) {
      const firstMonday = this.getNthWeekdayOfMonth(year, 1, 1, 1); // 1st Monday
      const secondMonday = new Date(firstMonday);
      secondMonday.setDate(firstMonday.getDate() + 7);
      if (day === secondMonday.getDate()) return true;
    }

    // Marine Day (3rd Monday of July)
    if (month === 7) {
      const thirdMonday = this.getNthWeekdayOfMonth(year, 7, 1, 3);
      if (day === thirdMonday.getDate()) return true;
    }

    // Respect for the Aged Day (3rd Monday of September)
    if (month === 9) {
      const thirdMonday = this.getNthWeekdayOfMonth(year, 9, 1, 3);
      if (day === thirdMonday.getDate()) return true;
    }

    // Health and Sports Day (2nd Monday of October)
    if (month === 10) {
      const secondMonday = this.getNthWeekdayOfMonth(year, 10, 1, 2);
      if (day === secondMonday.getDate()) return true;
    }

    // Vernal Equinox Day (around March 20-21)
    if (month === 3) {
      const vernalEquinox = Math.floor(20.8431 + 0.242194 * (year - 1851) - Math.floor((year - 1851) / 4));
      if (day === vernalEquinox) return true;
    }

    // Autumnal Equinox Day (around September 22-23)
    if (month === 9) {
      const autumnalEquinox = Math.floor(23.2488 + 0.242194 * (year - 1851) - Math.floor((year - 1851) / 4));
      if (day === autumnalEquinox) return true;
    }

    return false;
  }

  // Helper function to get nth weekday of a month
  getNthWeekdayOfMonth(year, month, weekday, n) {
    const firstDay = new Date(year, month - 1, 1);
    const firstWeekday = firstDay.getDay();
    const daysToAdd = (weekday - firstWeekday + 7) % 7;
    const nthWeekday = new Date(year, month - 1, 1 + daysToAdd + (n - 1) * 7);
    return nthWeekday;
  }

  generateTimeSlots(startDate, endDate, duration) {
    const slots = [];
    const WORK_START_HOUR = 9;  // 09:00
    const WORK_END_HOUR = 17;   // 17:00 hard stop
    const LUNCH_START_HOUR = 13; // 1:00 PM
    const LUNCH_END_HOUR = 14;   // 2:00 PM
    const STEP_MINUTES = 30;    // step between slot starts

    console.log(`🌍 Server timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
    console.log(`🕐 Generating slots from ${WORK_START_HOUR}:00 to ${WORK_END_HOUR}:00`);

    // Clone boundaries
    const rangeStart = new Date(startDate);
    const rangeEnd = new Date(endDate);

    // Iterate day-by-day
    for (let day = new Date(rangeStart); day <= rangeEnd; day.setDate(day.getDate() + 1)) {
      const dayOfWeek = day.getDay();

      // Skip weekends
      if (dayOfWeek === 0 || dayOfWeek === 6) continue;

      // Skip Japanese public holidays
      if (this.isJapanesePublicHoliday(day)) {
        console.log(`Skipping Japanese public holiday: ${day.toDateString()}`);
        continue;
      }

      // Define working window for this day (timezone-safe)
      const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), WORK_START_HOUR, 0, 0, 0);
      const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), WORK_END_HOUR, 0, 0, 0);

      // Define lunch break (timezone-safe)
      const lunchStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), LUNCH_START_HOUR, 0, 0, 0);
      const lunchEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), LUNCH_END_HOUR, 0, 0, 0);

      console.log(`📅 Day: ${day.toDateString()}, Work: ${dayStart.toLocaleTimeString()} - ${dayEnd.toLocaleTimeString()}`);

      // Clip to overall range
      const windowStart = dayStart < rangeStart ? new Date(rangeStart) : dayStart;
      const windowEnd = dayEnd > rangeEnd ? new Date(rangeEnd) : dayEnd;

      // If window invalid, skip
      if (windowStart >= windowEnd) continue;

      // Walk within window by step minutes
      for (let t = new Date(windowStart); t < windowEnd; t.setMinutes(t.getMinutes() + STEP_MINUTES)) {
        const slotStart = new Date(t);
        const slotEnd = new Date(slotStart.getTime() + duration * 60000);

        // Skip if slot extends beyond work hours (use dayEnd, not windowEnd)
        if (slotEnd > dayEnd) {
          console.log(`⏰ Skipping slot beyond work hours: ${slotStart.toLocaleTimeString()} - ${slotEnd.toLocaleTimeString()}`);
          continue;
        }

        // Skip if slot conflicts with lunch break (1-2 PM)
        if (slotStart < lunchEnd && slotEnd > lunchStart) {
          console.log(`🍽️ Skipping lunch break slot: ${slotStart.toLocaleTimeString()} - ${slotEnd.toLocaleTimeString()}`);
          continue;
        }

        // Additional safety check: ensure slot hour is within business hours
        const slotHour = slotStart.getHours();
        if (slotHour < WORK_START_HOUR || slotHour >= WORK_END_HOUR) {
          console.log(`❌ Rejecting slot outside business hours: ${slotStart.toLocaleTimeString()} (hour: ${slotHour})`);
          continue;
        }

        slots.push({ start: slotStart, end: slotEnd });
      }
    }

    console.log(`✅ Generated ${slots.length} slots total`);
    if (slots.length > 0) {
      console.log(`🕐 First slot: ${slots[0].start.toLocaleString()}`);
      console.log(`🕐 Last slot: ${slots[slots.length - 1].start.toLocaleString()}`);
    }

    return slots;
  }

  isSlotConflicting(slot, busyTimes) {
    return busyTimes.some(busy => (slot.start < busy.end && slot.end > busy.start));
  }

  async createCalendarEvent(candidateEmail, candidateName, interviewerEmails, startTime, endTime, summary) {
    try {
      console.log(`Creating calendar event for ${candidateName} with interviewers: ${interviewerEmails.join(', ')}`);

      // Use first interviewer as organizer and create event without attendees first
      const primaryInterviewerEmail = interviewerEmails[0];
      console.log(`Using ${primaryInterviewerEmail} as event organizer`);

      const jwtClient = this.createJWTClient(primaryInterviewerEmail);
      const calendar = google.calendar({
        version: 'v3',
        auth: jwtClient,
        key: this.apiKey
      });

      // Create event with all attendees from the beginning
      const eventData = {
        summary: summary,
        description: `Interview session for ${candidateName}\n\nCandidate: ${candidateEmail}\nInterviewers: ${interviewerEmails.join(', ')}`,
        start: {
          dateTime: startTime.toISOString(),
          timeZone: 'Asia/Kolkata'
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: 'Asia/Kolkata'
        },
        // Include all attendees from the beginning
        attendees: [
          { email: candidateEmail, displayName: candidateName },
          ...interviewerEmails.map(email => ({ email }))
        ],
        conferenceData: {
          createRequest: {
            requestId: `interview-${Date.now()}`,
            conferenceSolutionKey: {
              type: 'hangoutsMeet'
            }
          }
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 }, // 1 day before
            { method: 'email', minutes: 60 },      // 1 hour before
            { method: 'popup', minutes: 15 }       // 15 minutes before
          ]
        }
      };

      console.log('Creating event with all attendees from the beginning...');
      console.log('Attendees:', [candidateEmail, ...interviewerEmails]);

      const meetResponse = await calendar.events.insert({
        calendarId: primaryInterviewerEmail,
        conferenceDataVersion: 1,
        sendUpdates: 'all', // Send invitations to all attendees immediately
        sendNotifications: true,
        requestBody: eventData
      });

      const event = meetResponse.data;
      console.log('✅ Event created successfully with all attendees:', event.id);

      const meetLink = event.hangoutLink || event.conferenceData?.entryPoints?.[0]?.uri;
      console.log('✅ Calendar event creation completed. Meet link:', meetLink);
      console.log('✅ All participants will receive calendar invitations immediately');

      // Step 2: Send notification email to organizer (fire-and-forget for faster response)
      console.log('Step 2: Scheduling notification email to organizer (async)...');

      // Fire-and-forget email sending - don't wait for it to complete
      setImmediate(async () => {
        try {
          // Get organizer name from database
          const organizerResult = await pool.query('SELECT name FROM users WHERE email = $1', [primaryInterviewerEmail]);
          const organizerName = organizerResult.rows[0]?.name || 'Interviewer';

          await sendInterviewSlotBookedNotification(
            primaryInterviewerEmail,
            organizerName,
            candidateEmail,
            candidateName,
            interviewerEmails,
            startTime,
            endTime,
            summary,
            meetLink
          );

          console.log('✅ Notification email sent to organizer (async)');
        } catch (emailError) {
          console.error('⚠️ Failed to send notification email to organizer:', emailError.message);
          // Email failure doesn't affect the booking - it was already successful
        }
      });

      console.log('✅ Calendar event creation completed - returning immediately');

      return {
        eventId: event.id,
        meetLink: meetLink,
        htmlLink: event.htmlLink
      };
    } catch (error) {
      console.error('❌ Error creating calendar event:', error.message);
      throw error;
    }
  }

  async updateCalendarEvent(eventId, updates) {
    try {
      const response = await this.calendar.events.patch({
        calendarId: 'primary',
        eventId: eventId,
        requestBody: updates
      });
      return response.data;
    } catch (error) {
      console.error('Error updating calendar event:', error);
      throw error;
    }
  }

  async deleteCalendarEvent(eventId) {
    try {
      await this.calendar.events.delete({
        calendarId: 'primary',
        eventId: eventId
      });
    } catch (error) {
      console.error('Error deleting calendar event:', error);
      throw error;
    }
  }
}

module.exports = new CalendarService();