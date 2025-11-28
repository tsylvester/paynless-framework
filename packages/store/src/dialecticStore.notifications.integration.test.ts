import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from '@testing-library/react';
import { useNotificationStore } from './notificationStore';
import { useDialecticStore, initialDialecticStateValues } from './dialecticStore';
import { useWalletStore } from './walletStore';
import type { Notification, DialecticStageRecipe, DialecticStageRecipeStep, StageRunDocumentDescriptor, StageRenderedDocumentDescriptor } from '@paynless/types';
import { mockLogger, resetMockLogger } from '../../api/src/mocks/logger.mock';
import { resetApiMock } from '@paynless/api/mocks';

const isRenderedDescriptor = (
    descriptor: StageRunDocumentDescriptor | undefined,
): descriptor is StageRenderedDocumentDescriptor =>
    Boolean(descriptor && descriptor.descriptorType !== 'planned');

vi.mock('@paynless/utils', async (importOriginal) => {
    const actualUtils = await importOriginal<typeof import('@paynless/utils')>();
    const { mockLogger: loggerMock, resetMockLogger: resetLoggerMock } = await import('../../api/src/mocks/logger.mock');

    return {
        ...actualUtils,
        logger: loggerMock,
        resetMockLogger: resetLoggerMock,
    };
});

describe('Notification handling integration tests - optional fields', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetApiMock();
        resetMockLogger();
        useNotificationStore.setState({
            notifications: [],
            unreadCount: 0,
        });
        useDialecticStore.setState(initialDialecticStateValues);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('document_started with latestRenderedResourceId', () => {
        it('processes document_started notification with latestRenderedResourceId and handleDocumentStartedLogic receives it correctly', () => {
            const sessionId = 'session-integration-test';
            const stageSlug = 'thesis';
            const iterationNumber = 1;
            const jobId = 'job-integration-test';
            const modelId = 'model-integration-test';
            const documentKey = 'business_case';
            const latestRenderedResourceId = 'resource-id-123';
            const progressKey = `${sessionId}:${stageSlug}:${iterationNumber}`;

            const executeStep: DialecticStageRecipeStep = {
                id: 'execute-step-id',
                step_key: 'execute_step',
                step_slug: 'execute-step',
                step_name: 'Execute Step',
                execution_order: 1,
                job_type: 'EXECUTE',
                prompt_type: 'Turn',
                output_type: 'rendered_document',
                granularity_strategy: 'per_source_document',
                inputs_required: [],
                outputs_required: [
                    {
                        document_key: documentKey,
                        artifact_class: 'rendered_document',
                        file_type: 'markdown',
                    },
                ],
            };

            const recipe: DialecticStageRecipe = {
                stageSlug,
                instanceId: 'instance-integration-test',
                steps: [executeStep],
            };

            useDialecticStore.setState((state) => {
                state.recipesByStageSlug[stageSlug] = recipe;
                state.stageRunProgress[progressKey] = {
                    documents: {},
                    stepStatuses: {},
                };
            });

            const notification: Notification = {
                id: 'notification-doc-started-integration',
                user_id: 'user-integration-test',
                type: 'document_started',
                data: {
                    sessionId,
                    stageSlug,
                    iterationNumber,
                    job_id: jobId,
                    document_key: documentKey,
                    modelId,
                    step_key: 'execute_step',
                    latestRenderedResourceId,
                },
                read: false,
                created_at: new Date().toISOString(),
                is_internal_event: true,
                title: null,
                message: null,
                link_path: null,
            };

            act(() => {
                useNotificationStore.getState().handleIncomingNotification(notification);
            });

            const updatedProgress = useDialecticStore.getState().stageRunProgress[progressKey];
            expect(updatedProgress).toBeDefined();
            const descriptor = updatedProgress?.documents[documentKey];
            expect(descriptor).toBeDefined();
            expect(isRenderedDescriptor(descriptor)).toBe(true);
            
            if (isRenderedDescriptor(descriptor)) {
                expect(descriptor.latestRenderedResourceId).toBe(latestRenderedResourceId);
                expect(descriptor.status).toBe('generating');
                expect(descriptor.job_id).toBe(jobId);
                expect(descriptor.modelId).toBe(modelId);
            }

            const notifications = useNotificationStore.getState().notifications;
            expect(notifications.length).toBe(0);
        });
    });

    describe('WALLET_TRANSACTION with invalid data', () => {
        it('does not add notification to list, does not call wallet handler, and logs error when walletId is missing', () => {
            const initialNotificationCount = useNotificationStore.getState().notifications.length;
            const mockHandleWalletUpdate = vi.fn();
            
            vi.spyOn(useWalletStore.getState(), '_handleWalletUpdateNotification').mockImplementation(mockHandleWalletUpdate);

            const notification: Notification = {
                id: 'notification-wallet-invalid',
                user_id: 'user-integration-test',
                type: 'WALLET_TRANSACTION',
                data: {
                    newBalance: '100.00',
                },
                read: false,
                created_at: new Date().toISOString(),
                is_internal_event: false,
                title: null,
                message: null,
                link_path: null,
            };

            act(() => {
                useNotificationStore.getState().handleIncomingNotification(notification);
            });

            const finalNotificationCount = useNotificationStore.getState().notifications.length;
            expect(finalNotificationCount).toBe(initialNotificationCount);
            expect(mockHandleWalletUpdate).not.toHaveBeenCalled();

            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.stringContaining('WALLET_TRANSACTION'),
                expect.any(Object)
            );
        });

        it('does not add notification to list, does not call wallet handler, and logs error when newBalance is missing', () => {
            const initialNotificationCount = useNotificationStore.getState().notifications.length;
            const mockHandleWalletUpdate = vi.fn();
            
            vi.spyOn(useWalletStore.getState(), '_handleWalletUpdateNotification').mockImplementation(mockHandleWalletUpdate);

            const notification: Notification = {
                id: 'notification-wallet-invalid-2',
                user_id: 'user-integration-test',
                type: 'WALLET_TRANSACTION',
                data: {
                    walletId: 'wallet-123',
                },
                read: false,
                created_at: new Date().toISOString(),
                is_internal_event: false,
                title: null,
                message: null,
                link_path: null,
            };

            act(() => {
                useNotificationStore.getState().handleIncomingNotification(notification);
            });

            const finalNotificationCount = useNotificationStore.getState().notifications.length;
            expect(finalNotificationCount).toBe(initialNotificationCount);
            expect(mockHandleWalletUpdate).not.toHaveBeenCalled();

            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.stringContaining('WALLET_TRANSACTION'),
                expect.any(Object)
            );
        });

        it('does not add notification to list, does not call wallet handler, and logs error when data types are invalid', () => {
            const initialNotificationCount = useNotificationStore.getState().notifications.length;
            const mockHandleWalletUpdate = vi.fn();
            
            vi.spyOn(useWalletStore.getState(), '_handleWalletUpdateNotification').mockImplementation(mockHandleWalletUpdate);

            const notification: Notification = {
                id: 'notification-wallet-invalid-3',
                user_id: 'user-integration-test',
                type: 'WALLET_TRANSACTION',
                data: {
                    walletId: 123,
                    newBalance: '100.00',
                },
                read: false,
                created_at: new Date().toISOString(),
                is_internal_event: false,
                title: null,
                message: null,
                link_path: null,
            };

            act(() => {
                useNotificationStore.getState().handleIncomingNotification(notification);
            });

            const finalNotificationCount = useNotificationStore.getState().notifications.length;
            expect(finalNotificationCount).toBe(initialNotificationCount);
            expect(mockHandleWalletUpdate).not.toHaveBeenCalled();

            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.stringContaining('WALLET_TRANSACTION'),
                expect.any(Object)
            );
        });
    });

    describe('WALLET_TRANSACTION with valid data', () => {
        it('calls wallet handler with correct data and adds notification to list when data is valid', () => {
            const initialNotificationCount = useNotificationStore.getState().notifications.length;
            const mockHandleWalletUpdate = vi.fn();
            
            vi.spyOn(useWalletStore.getState(), '_handleWalletUpdateNotification').mockImplementation(mockHandleWalletUpdate);

            const walletId = 'wallet-valid-123';
            const newBalance = '250.50';

            const notification: Notification = {
                id: 'notification-wallet-valid',
                user_id: 'user-integration-test',
                type: 'WALLET_TRANSACTION',
                data: {
                    walletId,
                    newBalance,
                },
                read: false,
                created_at: new Date().toISOString(),
                is_internal_event: false,
                title: null,
                message: null,
                link_path: null,
            };

            act(() => {
                useNotificationStore.getState().handleIncomingNotification(notification);
            });

            expect(mockHandleWalletUpdate).toHaveBeenCalledTimes(1);
            expect(mockHandleWalletUpdate).toHaveBeenCalledWith({
                walletId,
                newBalance,
            });

            const finalNotificationCount = useNotificationStore.getState().notifications.length;
            expect(finalNotificationCount).toBe(initialNotificationCount + 1);
            
            const notifications = useNotificationStore.getState().notifications;
            const addedNotification = notifications.find((n) => n.id === notification.id);
            expect(addedNotification).toBeDefined();
            expect(addedNotification?.id).toBe(notification.id);
        });
    });
});

