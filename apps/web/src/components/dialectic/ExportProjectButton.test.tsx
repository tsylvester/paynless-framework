import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use the shared mock store exports as the implementation of @paynless/store
vi.mock('@paynless/store', async () => {
	const mockStoreExports = await vi.importActual<typeof import('@/mocks/dialecticStore.mock')>('@/mocks/dialecticStore.mock');
	return {
		...mockStoreExports,
	};
});

// Mock toast API used for user feedback
vi.mock('sonner', () => ({
	toast: {
		success: vi.fn(),
		error: vi.fn(),
	},
}));

import { useDialecticStore, initialDialecticStateValues } from '@paynless/store';
import { toast } from 'sonner';

// Component under test (to be implemented in step 2)
import { ExportProjectButton } from './ExportProjectButton';

describe('ExportProjectButton', () => {
	beforeAll(() => {
		if (!(URL).createObjectURL) {
			Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:polyfill-url'), writable: true });
		}
		if (!(URL).revokeObjectURL) {
			Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), writable: true });
		}
	});
	beforeEach(() => {
		// Reset the mock store to a clean state before each test
		useDialecticStore.setState({ ...initialDialecticStateValues });
		vi.mocked(toast.success).mockClear();
		vi.mocked(toast.error).mockClear();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('renders a button and is disabled with aria-busy when exporting', () => {
		useDialecticStore.setState({ ...initialDialecticStateValues, isExportingProject: true });
		render(<ExportProjectButton projectId="proj-1" />);
		const button = screen.getByRole('button');
		expect(button).toBeDisabled();
		expect(button).toHaveAttribute('aria-busy', 'true');
	});

	it('calls exportDialecticProject with the provided projectId when clicked', async () => {
		const user = userEvent.setup();
		useDialecticStore.setState({ ...initialDialecticStateValues });
		const { exportDialecticProject } = useDialecticStore.getState();
		vi.mocked(exportDialecticProject).mockResolvedValue({ status: 200, data: { export_url: 'https://example.com/export.zip', file_name: 'export.zip' } });

		render(<ExportProjectButton projectId="proj-abc" />);
		const button = screen.getByRole('button');
		await user.click(button);

		await waitFor(() => {
			expect(exportDialecticProject).toHaveBeenCalledWith('proj-abc');
		});
	});

	it('on success triggers a programmatic download (anchor click) using returned export_url', async () => {
		const user = userEvent.setup();
		const exportUrl = 'https://example.com/signed/export.zip';
		useDialecticStore.setState({ ...initialDialecticStateValues });
		const { exportDialecticProject } = useDialecticStore.getState();
		vi.mocked(exportDialecticProject).mockResolvedValue({ data: { export_url: exportUrl, file_name: 'export.zip' }, status: 200 });

		// Mock fetch → Blob flow used by the component and anchor click
		const blob = new Blob(['zip-bytes'], { type: 'application/zip' });
		const response = new Response(blob, { headers: new Headers() });
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
		vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
		vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
		const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

		render(<ExportProjectButton projectId="proj-download" />);
		await user.click(screen.getByRole('button'));

		await waitFor(() => {
			expect(exportDialecticProject).toHaveBeenCalledWith('proj-download');
			expect(clickSpy).toHaveBeenCalled();
		});

		clickSpy.mockRestore();
	});

	it('shows an error toast when export fails', async () => {
		const user = userEvent.setup();
		useDialecticStore.setState({ ...initialDialecticStateValues });
		const { exportDialecticProject } = useDialecticStore.getState();
		vi.mocked(exportDialecticProject).mockResolvedValue({ error: { code: 'EXPORT_ERROR', message: 'Failed to export' }, status: 500 });

		render(<ExportProjectButton projectId="proj-fail" />);
		await user.click(screen.getByRole('button'));

		await waitFor(() => {
			expect(toast.error).toHaveBeenCalledWith('Failed to export');
		});
	});
});

	it('downloads via blob URL without navigation for cross-origin signed URL', async () => {
		const user = userEvent.setup();
		useDialecticStore.setState({ ...initialDialecticStateValues });
		const exportUrl = 'https://files.example.com/signed/export.zip';
		const { exportDialecticProject } = useDialecticStore.getState();
		vi.mocked(exportDialecticProject).mockResolvedValue({ data: { export_url: exportUrl, file_name: 'export.zip' }, status: 200 });

		const blob = new Blob(['zip-bytes'], { type: 'application/zip' });
		const response = new Response(blob, { headers: new Headers() });
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
		const createUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
		const revokeUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
		const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
		const setAttrSpy = vi.spyOn(HTMLAnchorElement.prototype, 'setAttribute');
		const openSpy = vi.spyOn(window, 'open');

		render(<ExportProjectButton projectId="proj-cross-origin" />);
		await user.click(screen.getByRole('button'));

		await waitFor(() => {
			expect(exportDialecticProject).toHaveBeenCalledWith('proj-cross-origin');
			expect(fetchSpy).toHaveBeenCalledWith(exportUrl, { method: 'GET' });
			expect(createUrlSpy).toHaveBeenCalled();
			expect(clickSpy).toHaveBeenCalled();
			// Ensure we set the download attribute on the anchor
			const downloadCalls = setAttrSpy.mock.calls.filter(c => c[0] === 'download');
			expect(downloadCalls.length).toBeGreaterThan(0);
			// No navigation APIs invoked
			expect(openSpy).not.toHaveBeenCalled();
			expect(revokeUrlSpy).toHaveBeenCalled();
		});

		fetchSpy.mockRestore();
		createUrlSpy.mockRestore();
		revokeUrlSpy.mockRestore();
		clickSpy.mockRestore();
		setAttrSpy.mockRestore();
		openSpy.mockRestore();
	});

	it('uses backend file_name even if Content-Disposition is present', async () => {
		const user = userEvent.setup();
		useDialecticStore.setState({ ...initialDialecticStateValues });
		const exportUrl = 'https://cdn.example.com/download?id=abc';
		const { exportDialecticProject } = useDialecticStore.getState();
		const filename = 'project_export_expected.zip';
		vi.mocked(exportDialecticProject).mockResolvedValue({ data: { export_url: exportUrl, file_name: filename }, status: 200 });

		const headers = new Headers({ 'Content-Disposition': `attachment; filename="ignored-by-frontend.zip"` });
		const blob = new Blob(['zip-bytes'], { type: 'application/zip' });
		const response = new Response(blob, { headers });
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
		vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
		vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
		const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
		const setAttrSpy = vi.spyOn(HTMLAnchorElement.prototype, 'setAttribute');

		render(<ExportProjectButton projectId="proj-filename" />);
		await user.click(screen.getByRole('button'));

		await waitFor(() => {
			expect(exportDialecticProject).toHaveBeenCalledWith('proj-filename');
			expect(fetchSpy).toHaveBeenCalled();
			expect(clickSpy).toHaveBeenCalled();
			// Assert we requested the backend-provided filename via the download attribute
			const downloadCalls = setAttrSpy.mock.calls.filter(c => c[0] === 'download');
			expect(downloadCalls.length).toBeGreaterThan(0);
			const lastDownloadArg = downloadCalls[downloadCalls.length - 1][1];
			expect(lastDownloadArg).toBe(filename);
		});

		fetchSpy.mockRestore();
		clickSpy.mockRestore();
		setAttrSpy.mockRestore();
	});

	it('uses backend-provided file_name exactly for download attribute', async () => {
		const user = userEvent.setup();
		useDialecticStore.setState({ ...initialDialecticStateValues });
		const exportUrl = 'https://cdn.example.com/download?id=def';
		const expectedFileName = 'project_export_my-project.zip';
		const { exportDialecticProject } = useDialecticStore.getState();
		vi.mocked(exportDialecticProject).mockResolvedValue({ data: { export_url: exportUrl, file_name: expectedFileName }, status: 200 });

		const blob = new Blob(['zip-bytes'], { type: 'application/zip' });
		const response = new Response(blob, { headers: new Headers() });
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
		vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
		vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
		const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
		const setAttrSpy = vi.spyOn(HTMLAnchorElement.prototype, 'setAttribute');

		render(<ExportProjectButton projectId="proj-backend-filename" />);
		await user.click(screen.getByRole('button'));

		await waitFor(() => {
			expect(exportDialecticProject).toHaveBeenCalledWith('proj-backend-filename');
			expect(fetchSpy).toHaveBeenCalledWith(exportUrl, { method: 'GET' });
			expect(clickSpy).toHaveBeenCalled();
			const downloadCalls = setAttrSpy.mock.calls.filter(c => c[0] === 'download');
			expect(downloadCalls.length).toBeGreaterThan(0);
			const lastDownloadArg = downloadCalls[downloadCalls.length - 1][1];
			expect(lastDownloadArg).toBe(expectedFileName);
		});

		fetchSpy.mockRestore();
		clickSpy.mockRestore();
		setAttrSpy.mockRestore();
	});

	it('shows error and does not download when backend file_name is missing', async () => {
		const user = userEvent.setup();
		useDialecticStore.setState({ ...initialDialecticStateValues });
		const exportUrl = 'https://cdn.example.com/download?id=ghi';
		const { exportDialecticProject } = useDialecticStore.getState();
		vi.mocked(exportDialecticProject).mockResolvedValue({ status: 500, error: { code: 'MISSING_FILE_NAME', message: 'Missing file name' } });

		const fetchSpy = vi.spyOn(globalThis, 'fetch');
		const createUrlSpy = vi.spyOn(URL, 'createObjectURL');
		const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

		render(<ExportProjectButton projectId="proj-missing-filename" />);
		await user.click(screen.getByRole('button'));

		await waitFor(() => {
			// Expect we notified the user
			expect(toast.error).toHaveBeenCalled();
			// And did NOT attempt to download
			expect(fetchSpy).not.toHaveBeenCalled();
			expect(createUrlSpy).not.toHaveBeenCalled();
			expect(clickSpy).not.toHaveBeenCalled();
		});

		clickSpy.mockRestore();
	});


