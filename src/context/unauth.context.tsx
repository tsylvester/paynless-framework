import { createContext, ReactNode } from 'react';
import { User } from '../types/auth.types';
import { unauthService } from '../services/unauth.service';
import { logger } from '../utils/logger';

interface UnauthContextType {
  register: (email: string, password: string, firstName?: string, lastName?: string) => Promise<User | null>;
}

// Create context with default values
export const UnauthContext = createContext<UnauthContextType>({
  register: async () => null,
});

interface UnauthProviderProps {
  children: ReactNode;
}

export function UnauthProvider({ children }: UnauthProviderProps) {
  const register = async (
    email: string,
    password: string,
    firstName?: string,
    lastName?: string
  ): Promise<User | null> => {
    try {
      const user = await unauthService.register({
        email,
        password,
        firstName,
        lastName,
      });
      
      return user;
    } catch (error) {
      logger.error('Registration error in context', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  };
  
  const contextValue = {
    register,
  };
  
  return (
    <UnauthContext.Provider value={contextValue}>
      {children}
    </UnauthContext.Provider>
  );
} 