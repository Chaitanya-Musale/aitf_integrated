'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, Clock, Users, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

export default function BookSlotPage() {
  const params = useParams();
  const router = useRouter();
  const { token } = params;

  const [loading, setLoading] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [booking, setBooking] = useState(false);
  const [bookingData, setBookingData] = useState(null);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [requestingReassignment, setRequestingReassignment] = useState(false);
  const [reassignmentRequested, setReassignmentRequested] = useState(false);

  useEffect(() => {
    if (token) {
      loadAvailableSlots();
    }
  }, [token]);

  const loadAvailableSlots = async () => {
    try {
      setLoading(true);
      setError(null);

      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
      const response = await fetch(`${API_URL}/calendar/available-slots/${token}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load available slots');
      }

      setBookingData({
        candidate: data.candidate,
        round: data.round,
        expiresAt: data.expiresAt
      });
      setAvailableSlots(data.availableSlots);
      
      // Auto-select first available date if slots exist
      if (data.availableSlots.length > 0) {
        const firstDate = new Date(data.availableSlots[0].start).toDateString();
        setSelectedDate(firstDate);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDateSelection = async (date) => {
    setSelectedDate(date);
    setSelectedSlot(null); // Clear selected slot when date changes
    
    // Refresh available slots when date changes to ensure real-time availability
    if (date) {
      await refreshAvailableSlots();
    }
  };

  const refreshAvailableSlots = async () => {
    try {
      setLoadingSlots(true);
      setError(null);

      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
      const response = await fetch(`${API_URL}/calendar/available-slots/${token}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to refresh available slots');
      }

      setAvailableSlots(data.availableSlots);
      console.log('✅ Available slots refreshed for real-time availability');
    } catch (err) {
      console.error('⚠️ Failed to refresh slots:', err.message);
      // Don't show error to user for refresh failures, just log it
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleRequestReassignment = async () => {
    try {
      setRequestingReassignment(true);
      setError(null);

      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
      const response = await fetch(`${API_URL}/calendar/request-reassignment/${token}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to request reassignment');
      }

      setReassignmentRequested(true);
      console.log('✅ Reassignment requested successfully');
    } catch (err) {
      setError(err.message);
    } finally {
      setRequestingReassignment(false);
    }
  };

  const handleSlotSelection = (slot) => {
    setSelectedSlot(slot);
  };

  const handleBookSlot = async () => {
    if (!selectedSlot) return;

    try {
      setBooking(true);
      setError(null);

      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
      const response = await fetch(`${API_URL}/calendar/book-slot/${token}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          slotStart: selectedSlot.start,
          slotEnd: selectedSlot.end
        })
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          setSelectedSlot(null);
          setError(data.error || 'That slot was just booked by someone else. Please pick another slot.');
          await loadAvailableSlots();
          return;
        }
        throw new Error(data.error || 'Failed to book slot');
      }

      setSuccess({
        scheduledTime: data.scheduledTime,
        meetLink: data.meetLink,
        calendarLink: data.calendarLink
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBooking(false);
    }
  };

  const formatDateTime = (dateString) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      }),
      time: date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      })
    };
  };

  const getAvailableDates = (slots) => {
    const dates = [...new Set(slots.map(slot => new Date(slot.start).toDateString()))];
    return dates.sort((a, b) => new Date(a) - new Date(b));
  };

  const getSlotsForDate = (slots, selectedDate) => {
    if (!selectedDate) return [];
    return slots.filter(slot => new Date(slot.start).toDateString() === selectedDate);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin mr-3" />
            <span>Loading available slots...</span>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <CardTitle className="text-red-600">Booking Error</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-gray-600 mb-4">{error}</p>
            <Button onClick={() => window.location.reload()} variant="outline">
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    const scheduledDateTime = formatDateTime(success.scheduledTime);
    
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-2xl">
          <CardHeader className="text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <CardTitle className="text-green-600">Interview Scheduled Successfully!</CardTitle>
            <CardDescription>Your interview has been confirmed</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-green-50 p-6 rounded-lg border border-green-200">
              <h3 className="font-semibold text-green-800 mb-4">Interview Details</h3>
              <div className="space-y-3 text-sm">
                <div className="flex items-center">
                  <Calendar className="w-4 h-4 text-green-600 mr-3" />
                  <span><strong>Date:</strong> {scheduledDateTime.date}</span>
                </div>
                <div className="flex items-center">
                  <Clock className="w-4 h-4 text-green-600 mr-3" />
                  <span><strong>Time:</strong> {scheduledDateTime.time}</span>
                </div>
                <div className="flex items-center">
                  <Users className="w-4 h-4 text-green-600 mr-3" />
                  <span><strong>Round:</strong> {bookingData?.round?.name}</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-semibold">Next Steps:</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>• You'll receive a calendar invitation with the meeting details</li>
                <li>• The Google Meet link will be included in the calendar event</li>
                <li>• Please join the meeting 5 minutes before the scheduled time</li>
                <li>• Make sure you have a stable internet connection and a quiet environment</li>
              </ul>
            </div>

            {success.meetLink && (
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h4 className="font-semibold text-blue-800 mb-2">Meeting Link</h4>
                <a 
                  href={success.meetLink} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 underline break-all"
                >
                  {success.meetLink}
                </a>
              </div>
            )}

            {/* Removed Done button - user can close the page or navigate away naturally */}
          </CardContent>
        </Card>
      </div>
    );
  }

  const expiryDate = new Date(bookingData?.expiresAt).toLocaleString();

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Schedule Your Interview</CardTitle>
            <CardDescription>
              Select your preferred time slot for the interview
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Interview Details */}
            <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
              <h3 className="font-semibold text-blue-800 mb-4">Interview Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <strong>Candidate:</strong> {bookingData?.candidate?.name}
                </div>
                <div>
                  <strong>Position:</strong> {bookingData?.round?.jobName}
                </div>
                <div>
                  <strong>Round:</strong> {bookingData?.round?.name}
                </div>
                <div>
                  <strong>Duration:</strong> {bookingData?.round?.duration} minutes
                </div>
              </div>
            </div>

            {/* Expiry Warning */}
            <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
              <div className="flex items-center">
                <AlertCircle className="w-5 h-5 text-yellow-600 mr-2" />
                <span className="text-sm text-yellow-800">
                  <strong>Important:</strong> This booking link expires on {expiryDate}
                </span>
              </div>
            </div>

            {/* Available Slots */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Available Time Slots</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={refreshAvailableSlots}
                  disabled={loadingSlots}
                  className="text-sm"
                >
                  {loadingSlots ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Refreshing...
                    </>
                  ) : (
                    <>
                      <Clock className="w-4 h-4 mr-2" />
                      Refresh Slots
                    </>
                  )}
                </Button>
              </div>
              
              {availableSlots.length === 0 ? (
                <div className="text-center py-8">
                  <Calendar className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                  {reassignmentRequested ? (
                    <div className="bg-green-50 p-6 rounded-lg border border-green-200 max-w-md mx-auto">
                      <div className="flex items-center justify-center mb-3">
                        <CheckCircle className="w-8 h-8 text-green-600" />
                      </div>
                      <h3 className="font-semibold text-green-800 mb-2">Reassignment Requested</h3>
                      <p className="text-green-700 text-sm">
                        Your request has been sent to HR. They will contact you with new interviewer assignments or alternative time slots.
                      </p>
                    </div>
                  ) : (
                    <div className="text-gray-500">
                      <p className="mb-4">No available slots found for the selected date range.</p>
                      <div className="space-y-3">
                        <p className="text-sm">If you cannot find a suitable time slot, you can request reassignment to different interviewers who may have more availability.</p>
                        <Button
                          onClick={handleRequestReassignment}
                          disabled={requestingReassignment}
                          className="bg-orange-600 hover:bg-orange-700 text-white"
                        >
                          {requestingReassignment ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin mr-2" />
                              Requesting...
                            </>
                          ) : (
                            'Request Reassignment'
                          )}
                        </Button>
                        <p className="text-xs text-gray-400">
                          This will notify HR to assign different interviewers or provide alternative options.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Date Selection Dropdown */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select Date
                    </label>
                    <select
                      value={selectedDate || ''}
                      onChange={(e) => handleDateSelection(e.target.value)}
                      className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Choose a date...</option>
                      {getAvailableDates(availableSlots).map((date) => (
                        <option key={date} value={date}>
                          {new Date(date).toLocaleDateString('en-US', { 
                            weekday: 'long', 
                            year: 'numeric', 
                            month: 'long', 
                            day: 'numeric' 
                          })}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Time Slots for Selected Date */}
                  {selectedDate && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium text-gray-700">
                          Available Times for {new Date(selectedDate).toLocaleDateString('en-US', { 
                            weekday: 'long', 
                            year: 'numeric', 
                            month: 'long', 
                            day: 'numeric' 
                          })}
                        </h4>
                      </div>
                      
                      {loadingSlots ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="w-6 h-6 animate-spin mr-3 text-blue-600" />
                          <span className="text-gray-600">Refreshing available slots...</span>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                          {getSlotsForDate(availableSlots, selectedDate).map((slot, index) => {
                            const startTime = new Date(slot.start);
                            const endTime = new Date(slot.end);
                            const timeString = `${startTime.toLocaleTimeString('en-US', { 
                              hour: '2-digit', 
                              minute: '2-digit',
                              hour12: true 
                            })} - ${endTime.toLocaleTimeString('en-US', { 
                              hour: '2-digit', 
                              minute: '2-digit',
                              hour12: true 
                            })}`;
                            
                            const isSelected = selectedSlot && 
                              new Date(selectedSlot.start).getTime() === startTime.getTime();

                            return (
                              <Button
                                key={index}
                                variant={isSelected ? "default" : "outline"}
                                className={`h-auto py-3 px-4 text-sm ${
                                  isSelected ? 'bg-blue-600 hover:bg-blue-700' : ''
                                }`}
                                onClick={() => handleSlotSelection(slot)}
                              >
                                <div className="flex flex-col items-center">
                                  <Clock className="w-4 h-4 mb-1" />
                                  <span className="font-medium">{timeString}</span>
                                </div>
                              </Button>
                            );
                          })}
                        </div>
                      )}
                      
                      {!loadingSlots && getSlotsForDate(availableSlots, selectedDate).length === 0 && (
                        <div className="text-center py-8 text-gray-500">
                          <Clock className="w-8 h-8 mx-auto mb-3 text-gray-400" />
                          <p>No available slots for this date.</p>
                          <p className="text-sm mt-2">Please try selecting a different date.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Message when no date is selected */}
                  {!selectedDate && (
                    <div className="text-center py-8 text-gray-500">
                      <Calendar className="w-8 h-8 mx-auto mb-3 text-gray-400" />
                      <p>Please select a date to view available time slots.</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Selected Slot and Book Button */}
            {selectedSlot && (
              <div className="bg-green-50 p-6 rounded-lg border border-green-200">
                <h4 className="font-semibold text-green-800 mb-3">Selected Time Slot</h4>
                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    <div className="font-medium">
                      {formatDateTime(selectedSlot.start).date}
                    </div>
                    <div className="text-green-700">
                      {formatDateTime(selectedSlot.start).time} - {formatDateTime(selectedSlot.end).time}
                    </div>
                  </div>
                  <Button 
                    onClick={handleBookSlot}
                    disabled={booking}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {booking ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Booking...
                      </>
                    ) : (
                      'Confirm Booking'
                    )}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}