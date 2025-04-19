import { Layout } from '../components/layout/Layout'
import { useAuthStore } from '@paynless/store'
import { ProfileEditor } from '../components/profile/ProfileEditor'

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
      <Layout>
        <div className="flex justify-center items-center h-64">
          <p>Loading profile...</p>
        </div>
      </Layout>
    )
  }

  if (!currentProfile) {
    return (
      <Layout>
        <div className="text-center p-4 text-red-600">
          Could not load profile data. {authError?.message}
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="py-20 pt-6">
        <ProfileEditor />
      </div>
      {/* Feedback moved inside ProfileEditor or handled via store state globally */}
    </Layout>
  )
}
