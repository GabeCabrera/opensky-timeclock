-- Complete Database Schema for OpenSky Time Clock
-- This represents the current state after all migrations

-- Create users table with all features
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Admin and provisioning
    is_admin BOOLEAN DEFAULT false,
    is_super_user BOOLEAN DEFAULT false,
    is_provisioned BOOLEAN DEFAULT false,
    provision_token VARCHAR(255),
    provision_token_expires TIMESTAMP,
    
    -- Personal information
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    
    -- Pay settings (admin controlled)
    hourly_rate DECIMAL(10, 2) DEFAULT 0,
    tax_rate DECIMAL(5, 2) DEFAULT 25,
    pay_schedule VARCHAR(20) DEFAULT 'bi-weekly',
    overtime_enabled BOOLEAN DEFAULT false,
    overtime_rate DECIMAL(4, 2) DEFAULT 1.5,
    
    -- User preferences
    time_format VARCHAR(5) DEFAULT '12',
    timezone VARCHAR(50) DEFAULT 'America/New_York',
    week_start_day VARCHAR(10) DEFAULT 'monday',
    
    -- Notification settings
    email_notifications BOOLEAN DEFAULT true,
    email_rejection_notifications BOOLEAN DEFAULT true,
    reminder_notifications BOOLEAN DEFAULT true,
    
    -- Auto clock-out settings
    auto_clock_out_enabled BOOLEAN DEFAULT false,
    auto_clock_out_time TIME DEFAULT '18:00:00',
    
    -- Tracking
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create time_entries table
CREATE TABLE IF NOT EXISTS time_entries (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    clock_in TIMESTAMP NOT NULL,
    clock_out TIMESTAMP,
    is_manual BOOLEAN DEFAULT false,
    approval_status VARCHAR(20) DEFAULT 'pending',
    approved_by INTEGER REFERENCES users(id),
    approval_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_time_entries_user_id ON time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_clock_in ON time_entries(clock_in);
CREATE INDEX IF NOT EXISTS idx_time_entries_approval_status ON time_entries(approval_status);
CREATE INDEX IF NOT EXISTS idx_users_pay_schedule ON users(pay_schedule);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Create a default super user (password: admin123)
-- This should be changed in production
INSERT INTO users (
    email, 
    password_hash, 
    first_name, 
    last_name, 
    is_admin, 
    is_super_user, 
    is_provisioned
) VALUES (
    'admin@opensky.com',
    '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- admin123
    'System',
    'Administrator',
    true,
    true,
    true
) ON CONFLICT (email) DO NOTHING;