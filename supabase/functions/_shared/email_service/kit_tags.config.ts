// Kit tag configuration - maps ref slugs to Kit tag IDs
// These IDs need to be filled in after creating the tags in Kit dashboard

export interface KitTagConfig {
	tagId: string;
	description: string;
}

// Map of ref slugs to Kit tag configurations
export const kitTagMap: Record<string, KitTagConfig> = {
	vibecoder: {
		tagId: "19053243", // TODO: Replace with actual Kit tag ID
		description: "Vibe Coders - developers who care about aesthetic and feel",
	},
	indiehacker: {
		tagId: "19053242", // TODO: Replace with actual Kit tag ID
		description: "Indie Hackers - solo developers building their own products",
	},
	startup: {
		tagId: "19053244", // TODO: Replace with actual Kit tag ID
		description: "Startups - teams building new products from scratch",
	},
	agency: {
		tagId: "19053241", // TODO: Replace with actual Kit tag ID
		description: "Agencies - teams building products for clients",
	},
	pricing: {
		tagId: "19053245", // TODO: Replace with actual Kit tag ID
		description: "Pricing page visitors",
	},
	direct: {
		tagId: "", // No tag needed for direct signups
		description: "Direct signups - no specific referral source",
	},
	legacy_user: {
		tagId: "", // TODO: Replace with actual Kit tag ID
		description: "Users who signed up before newsletter system was implemented",
	},
	no_explicit_opt_in: {
		tagId: "19163119", // TODO: Replace with actual Kit tag ID
		description: "Legacy users who have not explicitly opted in to newsletter",
	},
};

// Primary newsletter tag used for subscription/unsubscription
export const KIT_NEWSLETTER_TAG_ID = "PLACEHOLDER_NEWSLETTER_TAG_ID"; // TODO: Replace with actual Kit tag ID

/**
 * Get the Kit tag ID for a given ref slug
 * @param ref The referral source slug
 * @returns The Kit tag ID or null if ref is unknown or has no tag
 */
export function getTagIdForRef(ref: string): string | null {
	const config = kitTagMap[ref];
	// Return null for empty strings or placeholder IDs
	if (!config?.tagId || config.tagId.startsWith("PLACEHOLDER_")) {
		return null;
	}
	return config.tagId;
}

// Export type for ref slugs
export type SegmentSlug = "vibecoder" | "indiehacker" | "startup" | "agency";
export const SEGMENT_SLUGS: SegmentSlug[] = [
	"vibecoder",
	"indiehacker",
	"startup",
	"agency",
];

/**
 * Type guard to check if a string is a valid segment slug
 */
export function isValidSegmentSlug(slug: string): slug is SegmentSlug {
	return SEGMENT_SLUGS.includes(slug as SegmentSlug);
}
