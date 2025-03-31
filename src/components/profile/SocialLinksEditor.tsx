import React, { useState } from 'react';
import { Link, Mail, Phone, Globe, X } from 'lucide-react';
import { SocialLink, PrivacyLevel } from '../../types/profile.types';

interface SocialLinksEditorProps {
  links: SocialLink[];
  onAddLink: (platform: string, url: string, privacyLevel: PrivacyLevel) => void;
  onUpdateLink: (id: string, url: string, privacyLevel: PrivacyLevel) => void;
  onDeleteLink: (id: string) => void;
}

const PLATFORMS = {
  email: {
    name: 'Email',
    icon: Mail,
    validator: (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    placeholder: 'you@example.com',
  },
  phone: {
    name: 'Phone',
    icon: Phone,
    validator: (value: string) => /^\+?[\d\s-()]{10,}$/.test(value),
    placeholder: '+1 (555) 123-4567',
  },
  whatsapp: {
    name: 'WhatsApp',
    icon: Phone,
    validator: (value: string) => /^\+?[\d\s-()]{10,}$/.test(value),
    placeholder: '+1 (555) 123-4567',
  },
  signal: {
    name: 'Signal',
    icon: Phone,
    validator: (value: string) => /^\+?[\d\s-()]{10,}$/.test(value),
    placeholder: '+1 (555) 123-4567',
  },
  instagram: {
    name: 'Instagram',
    icon: Link,
    validator: (value: string) => /^https:\/\/(www\.)?instagram\.com\/[\w\d._]+\/?$/.test(value),
    placeholder: 'https://instagram.com/username',
  },
  facebook: {
    name: 'Facebook',
    icon: Link,
    validator: (value: string) => /^https:\/\/(www\.)?facebook\.com\/[\w\d.]+\/?$/.test(value),
    placeholder: 'https://facebook.com/username',
  },
  bluesky: {
    name: 'Bluesky',
    icon: Link,
    validator: (value: string) => /^https:\/\/(www\.)?bsky\.app\/profile\/[\w\d.]+\/?$/.test(value),
    placeholder: 'https://bsky.app/profile/username',
  },
  linkedin: {
    name: 'LinkedIn',
    icon: Link,
    validator: (value: string) => /^https:\/\/(www\.)?linkedin\.com\/in\/[\w\d-]+\/?$/.test(value),
    placeholder: 'https://linkedin.com/in/username',
  },
  reddit: {
    name: 'Reddit',
    icon: Link,
    validator: (value: string) => /^https:\/\/(www\.)?reddit\.com\/user\/[\w\d-]+\/?$/.test(value),
    placeholder: 'https://reddit.com/user/username',
  },
  medium: {
    name: 'Medium',
    icon: Link,
    validator: (value: string) => /^https:\/\/(www\.)?medium\.com\/@[\w\d-]+\/?$/.test(value),
    placeholder: 'https://medium.com/@username',
  },
  github: {
    name: 'GitHub',
    icon: Link,
    validator: (value: string) => /^https:\/\/(www\.)?github\.com\/[\w\d-]+\/?$/.test(value),
    placeholder: 'https://github.com/username',
  },
  discord: {
    name: 'Discord',
    icon: Link,
    validator: (value: string) => /^[\w\d]{2,32}#\d{4}$/.test(value),
    placeholder: 'username#1234',
  },
  website: {
    name: 'Website',
    icon: Globe,
    validator: (value: string) => /^https?:\/\/[\w\d-]+(\.[\w\d-]+)+.*$/.test(value),
    placeholder: 'https://example.com',
  },
};

export function SocialLinksEditor({
  links,
  onAddLink,
  onUpdateLink,
  onDeleteLink,
}: SocialLinksEditorProps) {
  const [newPlatform, setNewPlatform] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newPrivacyLevel, setNewPrivacyLevel] = useState<PrivacyLevel>(PrivacyLevel.PUBLIC);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = () => {
    if (!newPlatform || !newUrl) {
      setError('Please select a platform and enter a URL');
      return;
    }

    const platform = PLATFORMS[newPlatform as keyof typeof PLATFORMS];
    if (!platform.validator(newUrl)) {
      setError(`Invalid ${platform.name} format`);
      return;
    }

    onAddLink(newPlatform, newUrl, newPrivacyLevel);
    setNewPlatform('');
    setNewUrl('');
    setError(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-textPrimary mb-4">Social Links</h3>
        
        {/* Add new link */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <select
              value={newPlatform}
              onChange={(e) => setNewPlatform(e.target.value)}
              className="input"
            >
              <option value="">Select Platform</option>
              {Object.entries(PLATFORMS).map(([key, { name }]) => (
                <option key={key} value={key}>{name}</option>
              ))}
            </select>
            
            <select
              value={newPrivacyLevel}
              onChange={(e) => setNewPrivacyLevel(e.target.value as PrivacyLevel)}
              className="input"
            >
              <option value={PrivacyLevel.PUBLIC}>Public</option>
              <option value={PrivacyLevel.FOLLOWERS}>Followers Only</option>
              <option value={PrivacyLevel.PRIVATE}>Private</option>
            </select>
          </div>
          
          <div className="flex space-x-2">
            <input
              type="text"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder={newPlatform ? PLATFORMS[newPlatform as keyof typeof PLATFORMS].placeholder : 'Enter URL or value'}
              className="input flex-1"
            />
            <button
              type="button"
              onClick={handleAdd}
              className="px-4 py-2 bg-primary text-white rounded-md hover:bg-opacity-90"
            >
              Add
            </button>
          </div>
          
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
        </div>
      </div>

      {/* Existing links */}
      <div className="space-y-3">
        {links.map((link) => {
          const platform = PLATFORMS[link.platform as keyof typeof PLATFORMS];
          const Icon = platform?.icon || Link;
          
          return (
            <div key={link.id} className="flex items-center space-x-3">
              <Icon className="h-5 w-5 text-textSecondary flex-shrink-0" />
              
              <div className="flex-1 grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={link.url}
                  onChange={(e) => onUpdateLink(link.id, e.target.value, link.privacyLevel)}
                  className="input"
                />
                
                <select
                  value={link.privacyLevel}
                  onChange={(e) => onUpdateLink(link.id, link.url, e.target.value as PrivacyLevel)}
                  className="input"
                >
                  <option value={PrivacyLevel.PUBLIC}>Public</option>
                  <option value={PrivacyLevel.FOLLOWERS}>Followers Only</option>
                  <option value={PrivacyLevel.PRIVATE}>Private</option>
                </select>
              </div>
              
              <button
                type="button"
                onClick={() => onDeleteLink(link.id)}
                className="p-1 text-red-500 hover:text-red-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}