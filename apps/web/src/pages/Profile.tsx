import { useAuthStore } from '@paynless/store'
import { EditName } from '../components/profile/EditName'
import { EditEmail } from '../components/profile/EditEmail'
import { ProfilePrivacySettingsCard } from '../components/profile/ProfilePrivacySettingsCard'
import { NotificationSettingsCard } from '../components/profile/NotificationSettingsCard'
import { WalletBalanceDisplay } from '../components/wallet/WalletBalanceDisplay'
import ErrorBoundary from '../components/common/ErrorBoundary'
import { CardSkeleton } from '../components/common/CardSkeleton'
import { Card, CardHeader, CardContent, CardTitle } from '../components/ui/card'
import { AlertTriangle } from 'lucide-react'

export function ProfilePage() {
  const {
    profile: currentProfile,
    isLoading: authLoading,
    error: authError,
  } = useAuthStore((state) => ({
    profile: state.profile,
    isLoading: state.isLoading,
    error: state.error,
  }))

  if (authLoading && !currentProfile) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div data-testid="profile-grid-skeleton-container" className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <CardSkeleton numberOfFields={2} includeHeader={true} />
          <CardSkeleton numberOfFields={2} includeHeader={true} />
          <CardSkeleton numberOfFields={2} includeHeader={true} />
          <CardSkeleton numberOfFields={2} includeHeader={true} />
        </div>
      </div>
    )
  }

  if (authError && !currentProfile) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <Card className="w-full max-w-md mx-auto border-destructive bg-destructive/10">
          <CardHeader>
            <CardTitle className="flex items-center text-destructive text-lg">
              <AlertTriangle size={20} className="mr-2 shrink-0" />
              Could not load Profile Page
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-destructive/90 text-sm">
              {`Profile data could not be loaded. ${authError.message || 'Please try again later.'}`}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }
  
  if (!currentProfile) {
    return (
       <div className="container mx-auto px-4 py-8 text-center">
         <Card className="w-full max-w-md mx-auto border-destructive bg-destructive/10">
            <CardHeader>
              <CardTitle className="flex items-center text-destructive text-lg">
                <AlertTriangle size={20} className="mr-2 shrink-0" />
                Profile Unavailable
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-destructive/90 text-sm">
                Profile data is unavailable. Please ensure you are logged in and try refreshing the page.
              </p>
            </CardContent>
          </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div data-testid="profile-grid-container" className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ErrorBoundary 
          fallback={
            <Card className="w-full border-destructive bg-destructive/10">
              <CardHeader>
                <CardTitle className="flex items-center text-destructive text-lg">
                  <AlertTriangle size={20} className="mr-2 shrink-0" />
                  Error in Wallet Balance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-destructive/90 text-sm">
                  This section could not be loaded. Please try refreshing.
                </p>
              </CardContent>
            </Card>
          }
        >
          <WalletBalanceDisplay />
        </ErrorBoundary>
        
        <ErrorBoundary 
          fallback={
            <Card className="w-full border-destructive bg-destructive/10">
              <CardHeader>
                <CardTitle className="flex items-center text-destructive text-lg">
                  <AlertTriangle size={20} className="mr-2 shrink-0" />
                  Error in User Name
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-destructive/90 text-sm">
                  This section could not be loaded. Please try refreshing.
                </p>
              </CardContent>
            </Card>
          }
        >
          <EditName />
        </ErrorBoundary>
        
        <ErrorBoundary 
          fallback={
            <Card className="w-full border-destructive bg-destructive/10">
              <CardHeader>
                <CardTitle className="flex items-center text-destructive text-lg">
                  <AlertTriangle size={20} className="mr-2 shrink-0" />
                  Error in User Email
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-destructive/90 text-sm">
                  This section could not be loaded. Please try refreshing.
                </p>
              </CardContent>
            </Card>
          }
        >
          <EditEmail />
        </ErrorBoundary>
        
        <ErrorBoundary 
          fallback={
            <Card className="w-full border-destructive bg-destructive/10">
              <CardHeader>
                <CardTitle className="flex items-center text-destructive text-lg">
                  <AlertTriangle size={20} className="mr-2 shrink-0" />
                  Error in Privacy Settings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-destructive/90 text-sm">
                  This section could not be loaded. Please try refreshing.
                </p>
              </CardContent>
            </Card>
          }
        >
          <ProfilePrivacySettingsCard />
        </ErrorBoundary>

        <ErrorBoundary
          fallback={
            <Card className="w-full border-destructive bg-destructive/10">
              <CardHeader>
                <CardTitle className="flex items-center text-destructive text-lg">
                  <AlertTriangle size={20} className="mr-2 shrink-0" />
                  Error in Notification Settings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-destructive/90 text-sm">
                  This section could not be loaded. Please try refreshing.
                </p>
              </CardContent>
            </Card>
          }
        >
          <NotificationSettingsCard />
        </ErrorBoundary>
      </div>
    </div>
  )
}
