# OpenSky Time Clock

A modern, full-stack time tracking application with role-based access control, manual entry management, and organized pay period reporting.

## Features

### For Employees
- **Quick Clock In/Out** - Real-time timer with automatic duration tracking
- **Manual Time Entries** - Submit past entries for admin approval
- **Pay Period Organization** - View time logs grouped by bi-monthly periods with totals
- **Account Management** - Secure authentication with profile customization

### For Administrators
- **User Management** - Create, edit, and manage employee accounts
- **Approval Workflow** - Review and approve/deny manual time entries
- **Pay Settings** - Configure hourly rates and pay periods per user
- **Audit Trail** - Track all time entry modifications with detailed logs

### Technical Highlights
- **Real-time Updates** - Live timer display with HH:MM:SS precision
- **Smart Validation** - Prevents overlapping entries and enforces clock order
- **Responsive Design** - Mobile-friendly interface with Tailwind CSS
- **Structured Logging** - Environment-based log levels for debugging

## Tech Stack

### Frontend
- **React 19** with TypeScript
- **Tailwind CSS** for styling
- **Axios** for API communication
- **React Router** for navigation
- **React Datepicker** for time entry forms

### Backend
- **Node.js** + **Express**
- **PostgreSQL** (Neon hosted)
- **JWT** authentication with bcrypt
- **Resend** for email notifications

## Getting Started

### Prerequisites
- Node.js 16+
- PostgreSQL database (or Neon account)
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/opensky-timeclock.git
   cd opensky-timeclock
   ```

2. **Install dependencies**
   ```bash
   npm run install-all
   ```

3. **Configure environment variables**
   
   Create `backend/.env`:
   ```env
   # Database
   DATABASE_URL=your_postgresql_connection_string
   
   # Authentication
   JWT_SECRET=your_secure_jwt_secret
   
   # Email (optional)
   RESEND_API_KEY=your_resend_api_key
   ADMIN_EMAIL=admin@yourcompany.com
   
   # Logging
   LOG_LEVEL=info  # Options: error, warn, info, debug
   ```
   
   Create `frontend/.env`:
   ```env
   REACT_APP_API_URL=http://localhost:5001
   REACT_APP_FORCE_DEBUG=false  # Set to true to enable debug logs in production
   ```

4. **Initialize the database**
   ```bash
   cd backend
   npm run migrate
   ```

5. **Start the application**
   ```bash
   # From root directory
   npm run dev
   ```
   
   - Backend: http://localhost:5001
   - Frontend: http://localhost:3000

## Usage

### First-Time Setup
1. Navigate to http://localhost:3000
2. Register a new account
3. Log in with your credentials
4. Upgrade your account to admin role (manually in database for first admin)

### Time Tracking
- **Clock In**: Click the clock button on the home page
- **Clock Out**: Click the clock button again when finished
- **Manual Entry**: Click "Add Entry" to submit past time entries
- **View History**: Entries are organized by pay period in collapsible drawers

### Admin Portal
- Access via the admin icon in the navigation menu
- Manage users, approve entries, and configure pay settings
- View audit logs for all time entry modifications

## Project Structure

```
opensky-timeclock/
├── backend/
│   ├── config/          # Database configuration
│   ├── middleware/      # Authentication middleware
│   ├── migrations/      # Database migration scripts
│   ├── routes/          # API route handlers
│   │   ├── auth.js      # Authentication endpoints
│   │   ├── time.js      # Time tracking endpoints
│   │   └── admin.js     # Admin management endpoints
│   ├── utils/           # Logging, email, and utilities
│   └── server.js        # Express server entry point
├── frontend/
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── contexts/    # Auth, TimeLog, and Toast contexts
│   │   ├── services/    # API service layer
│   │   ├── types/       # TypeScript interfaces
│   │   └── utils/       # Helper functions
│   └── public/          # Static assets
└── docs/                # Additional documentation
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Create new account
- `POST /api/auth/login` - Authenticate user
- `POST /api/auth/logout` - End session
- `GET /api/auth/me` - Get current user info

### Time Tracking
- `POST /api/time/clock-in` - Start time entry
- `POST /api/time/clock-out` - End time entry
- `GET /api/time/entries` - Fetch user's time log
- `POST /api/time/entries` - Create manual entry
- `PUT /api/time/entries/:id` - Update existing entry
- `DELETE /api/time/entries/:id` - Remove entry

### Admin (Protected)
- `GET /api/admin/users` - List all users
- `POST /api/admin/users` - Create new user
- `PUT /api/admin/users/:id` - Update user details
- `DELETE /api/admin/users/:id` - Delete user
- `PUT /api/admin/entries/:id/approve` - Approve manual entry
- `PUT /api/admin/entries/:id/deny` - Deny manual entry

## Database Schema

**Key Tables:**
- `users` - Authentication and user profiles
- `time_entries` - Clock in/out records with approval status
- `time_entry_audit` - Change history for accountability

See `backend/schema-complete.sql` for full schema.

## Configuration

### Logging Levels
Set `LOG_LEVEL` in backend `.env`:
- `error` - Critical errors only
- `warn` - Warnings and errors
- `info` - General information (default)
- `debug` - Detailed debugging information

### Pay Periods
Default: Bi-monthly (1st-15th, 16th-end of month)

Customizable in `frontend/src/utils/payPeriod.ts` with support for:
- Weekly
- Bi-weekly
- Bi-monthly
- Monthly

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License.

## Support

For questions or issues, please open an issue on GitHub or contact the development team.

---

Built with ❤️ by OpenSky
- `POST /api/time/clock-out` - Clock out
- `GET /api/time/entries` - Get all time entries for user
- `GET /api/time/status` - Get current clock status

## Setup Instructions

### Prerequisites
- Node.js (v16 or higher)
- Neon PostgreSQL account
- Git

### 1. Database Setup
1. Create a new project in [Neon](https://neon.tech/)
2. Run the SQL schema from `backend/schema.sql` (and / or apply migrations described below) in your Neon console
3. Copy your connection string

### 2. Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create `.env` file from `.env.example`:
   ```bash
   cp .env.example .env
   ```

4. Update `.env` with your values (add `DISABLE_DB_SSL=false` if not already present – keep SSL enabled for Neon):
   ```
   NODE_ENV=development
   PORT=5000
   DATABASE_URL=your_neon_database_connection_string_here
   JWT_SECRET=your_super_secure_jwt_secret_key_here
   ```

5. (Optional) Run pending migrations manually (they also run automatically on server start):
   ```bash
   npm run migrate
   ```

6. Start the backend server:
   ```bash
   npm run dev
   ```

### 3. Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the frontend development server:
   ```bash
   npm start
   ```

### 4. Development (Both Backend and Frontend)
From the root directory, you can run both servers concurrently:

```bash
# Install all dependencies
npm run install-all

# Run both backend and frontend
npm run dev
```

### Database Migrations

Migrations live in `backend/migrations` and are plain ordered SQL files: `0001_description.sql`, `0002_other_change.sql`, etc.

Applied migrations are tracked in the `schema_migrations` table. On server startup, any new migration files are executed before the API begins listening. You can also run them explicitly:

```bash
cd backend
npm run migrate
```

If a migration fails, the server will refuse to start (ensuring a consistent schema).

### Removed Field: work_description (October 2025)

The application previously supported an optional free‑text `work_description` on each time entry. This field was removed from the UI and API responses to streamline the time tracking workflow. A destructive migration (`20251014_remove_work_description.sql`) drops the column from `time_entries`.

Why removed:
- Low usage / low signal-to-noise
- Simplifies manual entry approvals and reduces clutter
- Eliminates edge cases around truncation and validation

How to restore (reversible steps):
1. Add the column back via a new migration:
   ```sql
   ALTER TABLE time_entries ADD COLUMN work_description VARCHAR(200);
   ```
2. Reintroduce selection in backend queries (see git history prior to 2025-10-14 for references to `work_description`).
3. Add the textarea/input back into `TimeEntryModal` and any admin review components.
4. (Optional) Add indexing or full text search later if workload notes become important.

Historical data:
If you need legacy descriptions, restore from a database backup taken before running the drop-column migration. Once dropped, the text is not recoverable unless backed up.

### Neon Notes

Neon requires SSL for connections; the database config auto-enables SSL for Neon connection strings (`*.neon.tech`). If you ever connect to a local Postgres instance instead, you can export `DISABLE_DB_SSL=true` in your `.env` to turn SSL off.

If you see connection errors (ECONNREFUSED), verify:
- `DATABASE_URL` is present and correct
- Neon project is running (no suspend) and credentials match (role, password, database, host)
- Local network/firewall isn’t blocking outbound 5432

## Usage

The application now uses an *invite / provisioning* flow—self‑registration is intentionally disabled.

1. **Admin Invite**: An admin creates a user (first name, last name, email, optional role). A one‑time provision token + direct setup link are emailed to the user (7‑day expiry).
2. **Account Setup**: The user visits `/setup` (link auto‑prefills) and creates their password using the token.
3. **Login**: Post-setup the user logs in with email + password as usual.
4. **Clock In**: Click "Clock In" to start tracking time.
5. **Clock Out**: Click "Clock Out" to end the session.
6. **View Logs**: Review historical time entries in the log table.

Provisioning design & extension notes: see `docs/onboarding.md`.

### Outbound Email

Email sending now uses a simplified Resend-only mailer.

1. Add `RESEND_API_KEY` and `RESEND_FROM` to `backend/.env` (see `.env.example`). For early tests you can use an `@resend.dev` address.
2. Restart the backend.
3. As a super user call `POST /api/admin/email/test` with `{ "to": "you@example.com" }` to verify.

See `docs/email-setup.md` for domain verification and troubleshooting.

## Project Structure

```
opensky-timeclock/
├── backend/
│   ├── config/
│   │   └── database.js          # Database connection
│   ├── middleware/
│   │   └── auth.js              # JWT authentication middleware
│   ├── routes/
│   │   ├── auth.js              # Authentication routes
│   │   └── time.js              # Time tracking routes
│   ├── .env.example             # Environment variables template
│   ├── package.json
│   ├── schema.sql               # Database schema
│   └── server.js                # Express server setup
├── frontend/
│   ├── src/
│   │   ├── components/          # React components
│   │   ├── contexts/            # React contexts
│   │   ├── services/            # API service layer
│   │   └── types/               # TypeScript types
│   ├── .env                     # Frontend environment variables
│   └── package.json
└── package.json                 # Root package.json for concurrent scripts
```

## Security Features

- Passwords are hashed using bcrypt

## UI Identity & Sign Out Pattern

To maintain a consistent, uncluttered user experience, the application exposes user identity (avatar, name, role badges) and the sign out action **only in the global `Header` component**.

Guidelines:

- Do not place additional logout buttons inside dashboard cards or summary areas.
- If a component needs to greet the user, it may display a simple first-name greeting (e.g. `Hello, Alex!`) but should not re-render the avatar, role badge, or a sign-out affordance.
- Reuse `UserProfile` only in `Header` unless a future standalone account page explicitly requires a richer identity block.
- Use `LogoutButton` only in `Header` for now to preserve a single mental model for signing out.

Rationale:

- Reduces cognitive load and avoids duplicated interactive elements.
- Aligns with common SaaS dashboard conventions placing auth/account controls top-right.
- Simplifies future theming and accessibility improvements by centralizing identity UI.

If you introduce a new surface that appears to need identity UI, consider referencing this section and extending the existing components rather than duplicating markup.
- JWT tokens for secure authentication
- Protected API routes requiring authentication
- Input validation and error handling
- CORS configuration for frontend-backend communication

## Development Notes

- The app prevents multiple active clock-ins per user
- All times are displayed in military format (HH:MM:SS)
- JWT tokens expire after 24 hours
- The database uses indexes for optimized queries
- Responsive design for mobile and desktop use