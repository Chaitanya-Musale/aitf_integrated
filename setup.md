# AITF Authentication System Setup Guide

## Prerequisites

1. **Node.js** (v18 or higher)
2. **PostgreSQL** (v12 or higher)
3. **npm** or **yarn**

## Quick Setup

### 1. Install Dependencies

```bash
# Install root dependencies
npm install

# Install frontend dependencies
cd frontend
npm install

# Install backend dependencies
cd ../backend
npm install
cd ..
```

### 2. Database Setup

1. Create a PostgreSQL database:
   ```sql
   CREATE DATABASE aitf_auth;
   ```

2. Run the schema file:
   ```bash
   psql -U postgres -d aitf_auth -f database/schema_fixed.sql
   ```

### 3. Environment Configuration

1. Copy the example environment file:
   ```bash
   cp backend/.env.example backend/.env
   ```

2. Update `backend/.env` with your database credentials:
   ```env
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=aitf_auth
   DB_USER=your_postgres_user
   DB_PASSWORD=your_postgres_password
   ```

3. For email functionality, update the email settings in `backend/.env`:
   ```env
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=587
   EMAIL_USER=your_email@gmail.com
   EMAIL_PASS=your_app_password
   ```

### 4. Run the Application

```bash
# Start both frontend and backend
npm run dev
```

Or run them separately:

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

## Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000/api

## Default Admin Credentials

- **Email**: admin@aitf.com
- **Password**: admin123

## Features

### Admin Dashboard
- User management (create, activate/deactivate, delete)
- Role management (create, delete)
- User-role mapping
- Email notifications for new users

### Role-Based Access
- **Admin**: Full system access
- **HR**: HR-specific interface
- **Technical Team**: Technical interview interface
- **Management**: Management interface

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `GET /api/auth/profile` - Get current user profile
- `PUT /api/auth/change-password` - Change password

### Users (Admin only)
- `GET /api/users` - Get all users
- `POST /api/users` - Create new user
- `PUT /api/users/:id/status` - Update user status
- `DELETE /api/users/:id` - Delete user
- `PUT /api/users/:id/roles` - Update user roles

### Roles (Admin only)
- `GET /api/roles` - Get all roles
- `POST /api/roles` - Create new role
- `PUT /api/roles/:id` - Update role
- `DELETE /api/roles/:id` - Delete role

## Security Features

- JWT-based authentication
- Password hashing with bcrypt
- Rate limiting
- CORS protection
- Input validation
- SQL injection prevention

## Troubleshooting

### Database Connection Issues
1. Ensure PostgreSQL is running
2. Check database credentials in `.env`
3. Verify database exists and schema is loaded

### Email Issues
1. For Gmail, use App Passwords instead of regular password
2. Enable 2-factor authentication and generate an app password
3. Update EMAIL_USER and EMAIL_PASS in `.env`

### Port Conflicts
- Frontend runs on port 3000
- Backend runs on port 5000
- Change ports in respective package.json files if needed

## Production Deployment

1. Update environment variables for production
2. Use a proper email service (SendGrid, AWS SES, etc.)
3. Use environment-specific database credentials
4. Enable HTTPS
5. Set up proper logging and monitoring