import { ReactNode } from 'react'
import { Header } from './Header'
import { Footer } from './Footer'
import { Badges } from '../marketing/Badges'

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header />
      <main className="flex-grow pt-16">{children}</main>
      <Footer />
      <Badges />
    </div>
  )
}
