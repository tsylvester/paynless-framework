// supabase/functions/dialectic-worker/strategies/helpers.test.ts
import { assertEquals, assertExists } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { SourceDocument } from '../../dialectic-service/dialectic.interface.ts';
import { groupSourceDocumentsByType, findRelatedContributions } from './helpers.ts';

// Mock Data
const MOCK_SOURCE_DOCUMENTS: SourceDocument[] = [
    { id: 'thesis-1', contribution_type: 'thesis', target_contribution_id: null },
    { id: 'thesis-2', contribution_type: 'thesis', target_contribution_id: null },
    { id: 'antithesis-1a', contribution_type: 'antithesis', target_contribution_id: 'thesis-1' },
    { id: 'antithesis-1b', contribution_type: 'antithesis', target_contribution_id: 'thesis-1' },
    { id: 'antithesis-2a', contribution_type: 'antithesis', target_contribution_id: 'thesis-2' },
    { id: 'synthesis-1', contribution_type: 'synthesis', target_contribution_id: 'some-other-id' },
    // A document with a null contribution_type to test graceful handling
    { id: 'null-type-1', contribution_type: null, target_contribution_id: 'thesis-1' },
] as unknown as SourceDocument[];


Deno.test('groupSourceDocumentsByType should correctly group documents by their contribution_type', () => {
    const grouped = groupSourceDocumentsByType(MOCK_SOURCE_DOCUMENTS);

    assertExists(grouped.thesis, "Thesis group should exist");
    assertEquals(grouped.thesis.length, 2, "Should be 2 thesis documents");
    assertEquals(grouped.thesis[0].id, 'thesis-1');
    assertEquals(grouped.thesis[1].id, 'thesis-2');

    assertExists(grouped.antithesis, "Antithesis group should exist");
    assertEquals(grouped.antithesis.length, 3, "Should be 3 antithesis documents");
    assertEquals(grouped.antithesis[0].id, 'antithesis-1a');

    assertExists(grouped.synthesis, "Synthesis group should exist");
    assertEquals(grouped.synthesis.length, 1, "Should be 1 synthesis document");
    assertEquals(grouped.synthesis[0].id, 'synthesis-1');
    
    assertEquals(Object.keys(grouped).length, 3, "Should only contain keys for existing types");
});

Deno.test('groupSourceDocumentsByType should handle an empty input array', () => {
    const grouped = groupSourceDocumentsByType([]);
    assertEquals(Object.keys(grouped).length, 0, "Should return an empty object for empty input");
});

Deno.test('groupSourceDocumentsByType should handle an array with only one type of document', () => {
    const onlyTheses = MOCK_SOURCE_DOCUMENTS.filter(d => d.contribution_type === 'thesis');
    const grouped = groupSourceDocumentsByType(onlyTheses);
    
    assertEquals(Object.keys(grouped).length, 1, "Should only have one key for 'thesis'");
    assertExists(grouped.thesis);
    assertEquals(grouped.thesis.length, 2);
});

Deno.test('groupSourceDocumentsByType should return an empty object if all documents have null contribution_type', () => {
    const nullTypes: SourceDocument[] = [
        { id: 'null-1', contribution_type: null },
        { id: 'null-2', contribution_type: null },
    ] as unknown as SourceDocument[];
    const grouped = groupSourceDocumentsByType(nullTypes);
    assertEquals(Object.keys(grouped).length, 0);
});


Deno.test('findRelatedContributions should return documents with a matching target_contribution_id', () => {
    const antitheses = MOCK_SOURCE_DOCUMENTS.filter(doc => doc.contribution_type === 'antithesis');
    const relatedToThesis1 = findRelatedContributions(antitheses, 'thesis-1');
    
    assertEquals(relatedToThesis1.length, 2, "Should find 2 antitheses related to thesis-1");
    assertEquals(relatedToThesis1[0].id, 'antithesis-1a');
    assertEquals(relatedToThesis1[1].id, 'antithesis-1b');

    const relatedToThesis2 = findRelatedContributions(antitheses, 'thesis-2');
    assertEquals(relatedToThesis2.length, 1, "Should find 1 antithesis related to thesis-2");
    assertEquals(relatedToThesis2[0].id, 'antithesis-2a');
});

Deno.test('findRelatedContributions should correctly find documents with a null target_contribution_id', () => {
    const docsWithNullTarget = [
        ...MOCK_SOURCE_DOCUMENTS,
        { id: 'related-to-null', target_contribution_id: null, contribution_type: 'some_type' }
    ] as unknown as SourceDocument[];
    
    const related = findRelatedContributions(docsWithNullTarget, null);
    
    // It should find the two original theses and the new 'related-to-null' doc.
    assertEquals(related.length, 3, "Should find all documents where target_contribution_id is null");
    assertExists(related.find(d => d.id === 'thesis-1'));
    assertExists(related.find(d => d.id === 'thesis-2'));
    assertExists(related.find(d => d.id === 'related-to-null'));
});

Deno.test('findRelatedContributions should return an empty array if no matches are found', () => {
    const antitheses = MOCK_SOURCE_DOCUMENTS.filter(doc => doc.contribution_type === 'antithesis');
    const relatedToNonExistent = findRelatedContributions(antitheses, 'non-existent-id');
    assertEquals(relatedToNonExistent.length, 0, "Should return an empty array for a non-existent source ID");
});

Deno.test('findRelatedContributions should handle an empty input document array', () => {
    const related = findRelatedContributions([], 'thesis-1');
    assertEquals(related.length, 0, "Should return an empty array when given an empty document list");
}); 