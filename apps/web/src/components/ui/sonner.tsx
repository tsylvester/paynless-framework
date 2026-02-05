import { useTheme } from "next-themes"
import { Toaster as Sonner, ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        className: "backdrop-blur-md bg-background/80 border-0 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-2px_rgba(0,0,0,0.1)] dark:shadow-[0_4px_6px_-1px_rgba(0,0,0,0.3),0_2px_4px_-2px_rgba(0,0,0,0.3)] [&]:border-0 [&]:!border-0",
      }}
      style={
        {
          "--normal-bg": "hsl(var(--background) / 0.8)",
          "--normal-text": "var(--foreground)",
          "--normal-border": "transparent",
          "--border-radius": "0.5rem",
          "--toast-bg": "hsl(var(--background) / 0.8)",
          "--toast-border": "transparent",
          "--toast-text": "hsl(var(--foreground))",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
