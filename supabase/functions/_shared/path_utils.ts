// Helper function to derive a file extension from a MIME type
export function getExtensionFromMimeType(mimeType: string): string {
  if (!mimeType || typeof mimeType !== 'string') {
    console.warn('[getExtensionFromMimeType] Invalid mimeType input. Defaulting to .bin');
    return '.bin';
  }

  const primaryPart = mimeType.split(';')[0].trim().toLowerCase();
  const parts = primaryPart.split('/');
  const mainType = parts[0];
  let subtype = parts.length > 1 ? parts[1] : parts[0];

  // Handle common full MIME type overrides first for complex cases
  switch (primaryPart) {
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return '.docx';
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      return '.xlsx';
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      return '.pptx';
    case 'application/vnd.oasis.opendocument.text':
      return '.odt';
    case 'application/vnd.oasis.opendocument.spreadsheet':
      return '.ods';
    case 'application/vnd.oasis.opendocument.presentation':
      return '.odp';
    case 'application/msword':
        return '.doc';
    case 'application/vnd.ms-excel':
        return '.xls';
    case 'application/vnd.ms-powerpoint':
        return '.ppt';
    case 'image/svg+xml': // Specific case for svg+xml
        return '.svg';
    case 'application/ld+json':
        return '.json';
    case 'application/atom+xml':
        return '.xml';
  }

  // Process +xml, +json, +zip suffixes - these are strong indicators
  if (subtype.endsWith('+xml')) {
    return '.xml'; 
  }
  if (subtype.endsWith('+json')) {
    return '.json';
  }
  if (subtype.endsWith('+zip')) {
    return '.zip';
  }

  // Remove potential vendor-specific prefixes or other common prefixes to get a cleaner base for extension
  // More targeted stripping
  if (subtype.startsWith('vnd.') || subtype.startsWith('x-') || subtype.startsWith('ms-')) {
    const firstDotIndex = subtype.indexOf('.'); // Use indexOf for stripping prefixes like vnd.
    const firstDashIndex = subtype.indexOf('-'); // Use indexOf for stripping prefixes like x-

    if (subtype.startsWith('vnd.') && firstDotIndex > -1) {
      subtype = subtype.substring(firstDotIndex + 1);
    } else if (subtype.startsWith('x-') && firstDashIndex > -1) {
      subtype = subtype.substring(firstDashIndex + 1);
    } else if (subtype.startsWith('ms-') && firstDashIndex > -1) {
      subtype = subtype.substring(firstDashIndex + 1);
    }
    // If there were multiple segments like vnd.ms-excel, the above might leave ms-excel.
    // Another pass for ms- if it's still there after vnd. stripping
    if (subtype.startsWith('ms-') && subtype.indexOf('-') > -1) {
        subtype = subtype.substring(subtype.indexOf('-') + 1);
    }
  }
  
  // Common MIME subtype to extension mappings (after initial stripping)
  switch (subtype) { // Already toLowerCase() from primaryPart processing
    case 'jpeg':
      return '.jpg';
    case 'png':
      return '.png';
    case 'gif':
      return '.gif';
    case 'svg':
      return '.svg';
    case 'xml':
      return '.xml';
    case 'html':
      return '.html';
    case 'css':
      return '.css';
    case 'javascript':
      return '.js';
    case 'typescript':
      return '.ts';
    case 'json':
      return '.json';
    case 'pdf':
      return '.pdf';
    case 'zip':
      return '.zip';
    case 'markdown':
      return '.md';
    case 'plain':
      return '.txt';
    case 'csv':
      return '.csv';
    case 'octet-stream':
      return '.bin';
    // Check for already processed office types by their core subtype if full match failed
    case 'wordprocessingml.document': return '.docx';
    case 'spreadsheetml.sheet': return '.xlsx';
    case 'presentationml.presentation': return '.pptx';
    case 'opendocument.text': return '.odt';
    case 'opendocument.spreadsheet': return '.ods';
    case 'opendocument.presentation': return '.odp';
    case 'msword': return '.doc'; // Handles cases where vnd stripping left just msword
    case 'ms-excel': return '.xls';
    case 'msexcel': return '.xls'; // common variation
    case 'ms-powerpoint': return '.ppt';
    case 'mspowerpoint': return '.ppt'; // common variation
    default:
      // If no specific match, use the subtype itself if it looks like a plausible extension component
      // Relaxed length constraint for subtypes like 'unknown-type' or 'my-custom-format'
      if (/^[a-z0-9-]+$/i.test(subtype) && subtype.length > 1 && subtype.length <= 20 && !subtype.includes('.')) {
        return `.${subtype}`;
      }
      // If the main type is text and subtype is simple, prefer .txt
      if (mainType === 'text' && /^[a-z0-9-]+$/i.test(subtype) && subtype.length > 1 && subtype.length <= 20) {
        console.warn(`[getExtensionFromMimeType] Text MIME subtype: ${subtype} with no specific rule. Defaulting to .txt`);
        return '.txt';
      }
      console.warn(`[getExtensionFromMimeType] Unknown or complex MIME subtype: ${subtype} (from ${mimeType}). Defaulting to .bin`);
      return '.bin';
  }
} 