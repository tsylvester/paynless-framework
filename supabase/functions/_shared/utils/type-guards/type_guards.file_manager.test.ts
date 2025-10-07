import { assert, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { 
    isFileType,
    isCanonicalPathParams,
} from './type_guards.file_manager.ts';
import { CanonicalPathParams, FileType } from '../../types/file_manager.types.ts';

Deno.test('Type Guard: isCanonicalPathParams', async (t) => {
    await t.step('should return true for a valid CanonicalPathParams object', () => {
        const params: CanonicalPathParams = {
            contributionType: 'thesis',
            sourceModelSlugs: ['model-1', 'model-2'],
        };
        assert(isCanonicalPathParams(params));
    });

    await t.step('should return true for a minimal CanonicalPathParams object', () => {
        const params: CanonicalPathParams = {
            contributionType: 'synthesis',
        };
        assert(isCanonicalPathParams(params));
    });

    await t.step('should return false if contributionType is missing', () => {
        const params = {
            sourceModelSlugs: ['model-1'],
        };
        assert(!isCanonicalPathParams(params));
    });

    await t.step('should return false if contributionType is not a string', () => {
        const params = {
            contributionType: 123,
        };
        assert(!isCanonicalPathParams(params));
    });

    await t.step('should return false for non-object inputs', () => {
        assert(!isCanonicalPathParams(null));
        assert(!isCanonicalPathParams('a string'));
        assert(!isCanonicalPathParams([]));
    });
});

Deno.test('Type Guard: isFileType', async (t) => {
    for (const type of Object.values(FileType)) {
        await t.step(`should return true for valid file type: ${type}`, () => {
            assert(isFileType(type));
        });
    }

    await t.step('should return false for an invalid file type string', () => {
        assert(!isFileType('invalid_file_type'));
    });

    await t.step('should return false for a non-string value', () => {
        assert(!isFileType(null));
        assert(!isFileType(undefined));
        assert(!isFileType(123));
        assert(!isFileType({}));
        assert(!isFileType([]));
    });

    await t.step('should return false for a string that is a valid ContributionType but not a FileType', () => {
        assert(!isFileType('thesis'));
        assert(!isFileType('antithesis'));
    });
});