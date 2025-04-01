declare global {
  interface Window {
    __AUTH_STORE_REFRESH_SESSION?: () => Promise<boolean>;
  }
}

export {}; 