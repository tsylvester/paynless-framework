import React, { useState } from 'react';
import { Edit2, Check, X } from 'lucide-react';
import { logger } from '../../utils/logger';

interface ProfileFieldProps {
  label: string;
  value: string | null;
  isEditing: boolean;
  isLoading: boolean;
  error: string | null;
  onEdit: () => void;
  onCancel: () => void;
  onChange: (value: string) => void;
  onSave: () => Promise<void>;
  inputType?: string;
  placeholder?: string;
  validation?: (value: string) => string | null;
  readOnly?: boolean;
}

const ProfileField: React.FC<ProfileFieldProps> = ({
  label,
  value,
  isEditing,
  isLoading,
  error,
  onEdit,
  onCancel,
  onChange,
  onSave,
  inputType = 'text',
  placeholder = '',
  validation,
  readOnly = false
}) => {
  const [localValue, setLocalValue] = useState(value || '');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    
    if (validation) {
      const error = validation(newValue);
      setValidationError(error);
    } else {
      setValidationError(null);
    }
    
    onChange(newValue);
  };

  const handleSave = async () => {
    if (validation) {
      const error = validation(localValue);
      if (error) {
        setValidationError(error);
        return;
      }
    }
    
    try {
      await onSave();
      logger.debug(`${label} saved successfully`);
    } catch (error) {
      logger.error(`Error saving ${label}:`, error);
    }
  };

  if (isEditing) {
    return (
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        <div className="relative">
          <input
            type={inputType}
            value={localValue}
            onChange={handleChange}
            placeholder={placeholder}
            disabled={isLoading}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
          <div className="absolute inset-y-0 right-0 flex items-center pr-3">
            {isLoading ? (
              <div className="animate-spin h-4 w-4 border-2 border-gray-500 border-t-transparent rounded-full" />
            ) : (
              <div className="flex space-x-2">
                <button 
                  onClick={handleSave} 
                  disabled={!!validationError || isLoading}
                  className="text-green-600 hover:text-green-800 disabled:opacity-50"
                  aria-label="Save"
                >
                  <Check size={18} />
                </button>
                <button 
                  onClick={onCancel}
                  disabled={isLoading}
                  className="text-red-600 hover:text-red-800 disabled:opacity-50"
                  aria-label="Cancel"
                >
                  <X size={18} />
                </button>
              </div>
            )}
          </div>
        </div>
        {(validationError || error) && (
          <p className="text-sm text-red-600">{validationError || error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        {!readOnly && (
          <button
            onClick={onEdit}
            className="text-blue-600 hover:text-blue-800 flex items-center text-sm"
            aria-label={`Edit ${label}`}
          >
            <Edit2 size={16} className="mr-1" />
            Edit
          </button>
        )}
      </div>
      <div className="px-3 py-2 bg-gray-50 rounded-md text-gray-800 flex justify-between items-center">
        <span className="text-gray-800">{value || placeholder}</span>
      </div>
    </div>
  );
};

export default ProfileField;