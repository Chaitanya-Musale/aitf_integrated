# AITF Authentication System - Project Structure

```
aitf-auth-system/
├── README.md                     # Main project documentation
├── setup.md                     # Detailed setup instructions
├── package.json                 # Root package.json for scripts
├── install.bat                  # Windows installation script
├── install.sh                   # Unix/Linux installation script
├── PROJECT_STRUCTURE.md         # This file
│
├── database/                    # Database related files
│   └── schema.sql              # PostgreSQL database schema
│
├── backend/                     # Node.js + Express backend
│   ├── package.json            # Backend dependencies
│   ├── server.js               # Main server file
│   ├── .env                    # Environment variables
│   ├── .env.example            # Environment template
│   │
│   ├── config/
│   │   └── database.js         # Database connection config
│   │
│   ├── middleware/
│   │   └── auth.js             # Authentication middleware
│   │
│   ├── routes/
│   │   ├── auth.js             # Authentication routes
│   │   ├── users.js            # User management routes
│   │   └── roles.js            # Role management routes
│   │
│   └── utils/
│       ├── email.js            # Email utilities
│       └── helpers.js          # Helper functions
│
└── frontend/                    # Next.js frontend
    ├── package.json            # Frontend dependencies
    ├── next.config.js          # Next.js configuration
    ├── tailwind.config.js      # Tailwind CSS configuration
    ├── postcss.config.js       # PostCSS configuration
    ├── .env.local              # Frontend environment variables
    │
    ├── app/                    # Next.js app directory
    │   ├── globals.css         # Global styles
    │   ├── layout.js           # Root layout
    │   ├── page.js             # Home page (redirects)
    │   │
    │   ├── login/
    │   │   └── page.js         # Login page
    │   │
    │   ├── admin/
    │   │   └── page.js         # Admin dashboard
    │   │
    │   ├── hr/
    │   │   └── page.js         # HR interface
    │   │
    │   └── interviewer/
    │       └── page.js         # Technical/Management interface
    │
    ├── components/
    │   └── ui/                 # Shadcn UI components
    │       ├── button.jsx
    │       ├── input.jsx
    │       ├── label.jsx
    │       └── card.jsx
    │
    └── lib/
        ├── utils.js            # Utility functions
        └── auth.js             # Authentication services
```

## Key Features Implemented

### 🔐 Authentication System
- JWT-based authentication
- Secure password hashing with bcrypt
- Role-based access control
- Session management

### 👥 User Management (Admin Only)
- Create new users with email notifications
- Assign multiple roles to users
- Activate/deactivate user accounts
- Delete users (except admin)
- View all users with their roles and status

### 🛡️ Role Management (Admin Only)
- Create custom roles
- Delete roles (if not assigned to users)
- Default roles: Admin, HR, Technical Team, Management

### 📧 Email Integration
- Automatic email notifications for new users
- Random password generation
- Welcome emails with login credentials

### 🎨 User Interface
- Clean, responsive design with Tailwind CSS
- Shadcn UI components for consistency
- Mobile-friendly interface
- Role-specific dashboards

### 🔒 Security Features
- Input validation and sanitization
- SQL injection prevention
- Rate limiting
- CORS protection
- Secure headers with Helmet

## Default Roles & Access

| Role | Access Level | Interface | Base Role |
|------|-------------|-----------|-----------|
| Admin | Full system access | Admin Dashboard | ✅ |
| HR | HR operations | HR Interface | ✅ |
| Interviewer | Interview management | Interviewer Interface | ✅ |
| Technical Team | Technical interviews | Interviewer Interface | ❌ |
| Management | Management operations | Interviewer Interface | ❌ |

## API Security

- All protected routes require JWT authentication
- Role-based authorization middleware
- Input validation on all endpoints
- Error handling and logging

## Database Design

- Users table with status tracking
- Roles table for flexible role management
- User-roles mapping table for many-to-many relationships
- Proper indexing for performance
- Automatic timestamp updates

## Responsive Design

- Mobile-first approach
- Clean white background with black accents
- Hover effects and shadows for better UX
- Consistent spacing and typography
- Loading states and error handling