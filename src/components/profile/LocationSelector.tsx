import React, { useState } from 'react';
import { MapPin, Loader } from 'lucide-react';
import { Location, PrivacyLevel } from '../../types/profile.types';

interface LocationSelectorProps {
  location?: Location;
  privacyLevel: PrivacyLevel;
  onLocationChange: (location: Location | undefined) => void;
  onPrivacyLevelChange: (level: PrivacyLevel) => void;
}

export function LocationSelector({
  location,
  privacyLevel,
  onLocationChange,
  onPrivacyLevelChange,
}: LocationSelectorProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleManualLocationChange = (
    field: keyof Location,
    value: string | number | undefined
  ) => {
    onLocationChange({
      ...location,
      [field]: value,
    } as Location);
  };

  const handleGetLocation = () => {
    setIsLoading(true);
    setError(null);

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      setIsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          // Reverse geocoding using OpenStreetMap Nominatim API
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${position.coords.latitude}&lon=${position.coords.longitude}&format=json`
          );
          
          const data = await response.json();
          
          onLocationChange({
            address: data.display_name,
            city: data.address.city || data.address.town,
            state: data.address.state,
            country: data.address.country,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          });
        } catch (err) {
          setError('Failed to get location details');
        } finally {
          setIsLoading(false);
        }
      },
      (err) => {
        setError(err.message);
        setIsLoading(false);
      }
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-textPrimary">
            Location
          </label>
          <button
            type="button"
            onClick={handleGetLocation}
            disabled={isLoading}
            className="text-sm text-primary hover:text-primary/80 flex items-center"
          >
            {isLoading ? (
              <Loader className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <MapPin className="h-4 w-4 mr-1" />
            )}
            Use Current Location
          </button>
        </div>

        {error && (
          <p className="text-sm text-red-600 mb-2">{error}</p>
        )}

        <div className="space-y-3">
          <input
            type="text"
            placeholder="Address"
            value={location?.address || ''}
            onChange={(e) => handleManualLocationChange('address', e.target.value)}
            className="input w-full"
          />
          
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="City"
              value={location?.city || ''}
              onChange={(e) => handleManualLocationChange('city', e.target.value)}
              className="input"
            />
            <input
              type="text"
              placeholder="State"
              value={location?.state || ''}
              onChange={(e) => handleManualLocationChange('state', e.target.value)}
              className="input"
            />
          </div>
          
          <input
            type="text"
            placeholder="Country"
            value={location?.country || ''}
            onChange={(e) => handleManualLocationChange('country', e.target.value)}
            className="input w-full"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-textPrimary mb-2">
          Privacy Level
        </label>
        <select
          value={privacyLevel}
          onChange={(e) => onPrivacyLevelChange(e.target.value as PrivacyLevel)}
          className="input w-full"
        >
          <option value={PrivacyLevel.PUBLIC}>Public</option>
          <option value={PrivacyLevel.FOLLOWERS}>Followers Only</option>
          <option value={PrivacyLevel.PRIVATE}>Private</option>
        </select>
      </div>
    </div>
  );
}