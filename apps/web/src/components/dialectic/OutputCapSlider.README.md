# OutputCapSlider Component

## Overview

The OutputCapSlider component allows users to select a maximum output token limit for AI model responses, bounded by their subscription tier's maximum capacity.

## Tier Definitions

The component supports four tiers based on the database schema:

- **Free** (Level 0): 8,192 tokens max
- **Basic** (Level 10): 32,768 tokens max  
- **Premium** (Level 20): 131,072 tokens max
- **Ultra** (Level 30): Unlimited tokens

## Features

- **Tier-aware boundaries**: Users can only select values up to their subscription tier's limit
- **Upgrade CTAs**: Displays upgrade prompts when users attempt to select beyond their tier
- **Visual tier markers**: Clickable tier buttons for quick selection
- **Disabled range overlay**: Visual indication of unavailable token ranges
- **Dark mode support**: Fully styled for both light and dark themes
- **Zustand integration**: Stores selected value in dialectic store for global access

## Testing Different Tiers

You can pass a `testTierLevel` prop to the component for testing:

```tsx
<OutputCapSlider testTierLevel={10} /> // Simulates Basic tier
<OutputCapSlider testTierLevel={20} /> // Simulates Premium tier
<OutputCapSlider testTierLevel={30} /> // Simulates Ultra tier
```

## Backend Integration

### Current State
- Tier definitions are hardcoded to match the database schema
- User tier defaults to Free for all users
- Max output tokens are stored in the dialectic store

### Future Integration

The component is prepared for backend integration:

1. **Fetch tier definitions**: 
   - Will call an API endpoint to get tier definitions from `tier_definitions` table
   - Currently uses hardcoded defaults

2. **Fetch user tier**:
   - Will call the `current_plan_tier` RPC function to get the user's actual tier
   - Currently defaults to Free tier

3. **Pass to backend**:
   - The selected `maxOutputTokens` value is already included in the `GenerateContributionsPayload`
   - Backend will respect this limit when generating AI responses

## Usage

```tsx
import { OutputCapSlider } from './OutputCapSlider';

function MyComponent() {
  return (
    <OutputCapSlider 
      className="my-custom-class"
      onUpgradeClick={(tierName, tierLevel) => {
        // Handle upgrade CTA clicks
        console.log(`User wants to upgrade to ${tierName}`);
      }}
    />
  );
}
```

## Store Integration

The component integrates with the dialectic store:

```typescript
// Reading the value
const maxOutputTokens = useDialecticStore(state => state.maxOutputTokens);

// The value is automatically included in contribution generation
const payload: GenerateContributionsPayload = {
  // ... other fields
  maxOutputTokens: state.maxOutputTokens, // Automatically included
};
```

## Styling

The component uses Tailwind CSS with the following key classes:
- Tier markers use conditional styling based on accessibility and selection state
- Upgrade CTA uses amber color scheme for visibility
- Dark mode is fully supported with appropriate color inversions
- Responsive layout with flex-wrap for mobile devices

## Dependencies

- `@radix-ui/react-slider`: Base slider component
- `@paynless/store`: Zustand stores for state management
- `@paynless/utils`: Logger utility
- `lucide-react`: Icons (Sparkles, Lock, AlertCircle)
- Component UI primitives: Button, Badge, Tooltip, etc.