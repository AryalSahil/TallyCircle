import React, { createContext, useContext, useEffect, useState } from 'react';
import { CurrencyCode, SUPPORTED_CURRENCIES } from '../types';
import {
  convertInrPaiseToCurrencyAmount,
  formatCurrency,
  isSupportedCurrency,
} from '../utils/finance';
import { useAuth } from './AuthContext';

interface CurrencyContextValue {
  baseCurrency: CurrencyCode;
  currencySymbol: string;
  setBaseCurrency: (currency: CurrencyCode) => Promise<void>;
  formatAmount: (paiseInr: number, options?: { showSign?: boolean; compact?: boolean }) => string;
  convertToDisplayNumber: (paiseInr: number) => number;
}

const STORAGE_KEY = 'tallycircle_base_currency';

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const { profile, updateMyProfile } = useAuth();
  const [baseCurrency, setBaseCurrencyState] = useState<CurrencyCode>(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    return isSupportedCurrency(stored || undefined) ? (stored as CurrencyCode) : 'INR';
  });

  // Sync from user profile when signed in
  useEffect(() => {
    if (profile?.preferredCurrency && isSupportedCurrency(profile.preferredCurrency)) {
      setBaseCurrencyState(profile.preferredCurrency);
      localStorage.setItem(STORAGE_KEY, profile.preferredCurrency);
    }
  }, [profile?.preferredCurrency]);

  const setBaseCurrency = async (currency: CurrencyCode) => {
    setBaseCurrencyState(currency);
    localStorage.setItem(STORAGE_KEY, currency);
    if (profile && profile.preferredCurrency !== currency) {
      try {
        await updateMyProfile({ preferredCurrency: currency });
      } catch {
        // Local toggle already updated; ignore background profile sync error silently
      }
    }
  };

  const formatAmount = (
    paiseInr: number,
    options?: { showSign?: boolean; compact?: boolean }
  ) => formatCurrency(paiseInr, baseCurrency, options);

  const convertToDisplayNumber = (paiseInr: number) =>
    convertInrPaiseToCurrencyAmount(paiseInr, baseCurrency);

  const currencySymbol = SUPPORTED_CURRENCIES[baseCurrency]?.symbol || '₹';

  return (
    <CurrencyContext.Provider
      value={{
        baseCurrency,
        currencySymbol,
        setBaseCurrency,
        formatAmount,
        convertToDisplayNumber,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used inside CurrencyProvider');
  return ctx;
}
