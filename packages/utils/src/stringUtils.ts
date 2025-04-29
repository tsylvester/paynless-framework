/**
 * Generates initials from first and last names.
 * 
 * @param firstName - The first name (optional).
 * @param lastName - The last name (optional).
 * @returns A string containing the initials (e.g., "JD") or an empty string if names are not provided.
 */
export const getInitials = (
    firstName?: string | null,
    lastName?: string | null
): string => {
    const firstInitial = firstName?.charAt(0).toUpperCase() || '';
    const lastInitial = lastName?.charAt(0).toUpperCase() || '';

    // If only one name is provided, return just that initial
    if (firstName && !lastName) return firstInitial;
    if (!firstName && lastName) return lastInitial;
    
    return `${firstInitial}${lastInitial}`;
}; 