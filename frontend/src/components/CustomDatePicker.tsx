import React, { forwardRef } from 'react';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import "./CustomDatePicker.css";

interface CustomDatePickerProps {
  selected: Date | null;
  onChange: (date: Date | null) => void;
  placeholder?: string;
  disabled?: boolean;
  minDate?: Date;
  maxDate?: Date;
  showTimeSelect?: boolean;
  timeFormat?: string;
  timeIntervals?: number;
  dateFormat?: string;
  isClearable?: boolean;
  error?: boolean;
  required?: boolean;
}

// Custom input component with Tailwind styling
const CustomInput = forwardRef<HTMLInputElement, any>(({ value, onClick, placeholder, disabled, error, required }, ref) => (
  <div className="relative">
    <input
      ref={ref}
      value={value}
      onClick={onClick}
      placeholder={placeholder}
      disabled={disabled}
      readOnly
      required={required}
      className={`
        w-full px-3 py-2 border rounded-md bg-white
        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
        disabled:bg-gray-100 disabled:cursor-not-allowed
        cursor-pointer transition-colors
        ${error ? 'border-red-500' : 'border-gray-300 hover:border-gray-400'}
      `}
    />
    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    </div>
  </div>
));

CustomInput.displayName = 'CustomInput';

const CustomDatePicker: React.FC<CustomDatePickerProps> = ({
  selected,
  onChange,
  placeholder = "Select date and time",
  disabled = false,
  minDate,
  maxDate,
  showTimeSelect = true,
  timeFormat = "HH:mm",
  timeIntervals = 15,
  dateFormat = "MMMM d, yyyy h:mm aa",
  isClearable = false,
  error = false,
  required = false,
}) => {
  return (
    <div className="relative">
      <DatePicker
        selected={selected}
        onChange={onChange}
        showTimeSelect={showTimeSelect}
        timeFormat={timeFormat}
        timeIntervals={timeIntervals}
        dateFormat={dateFormat}
        minDate={minDate}
        maxDate={maxDate}
        disabled={disabled}
        isClearable={isClearable}
        placeholderText={placeholder}
        customInput={<CustomInput error={error} required={required} />}
        popperClassName="custom-datepicker-popper"
        calendarClassName="custom-datepicker-calendar"
        wrapperClassName="w-full"
      />
    </div>
  );
};

export default CustomDatePicker;