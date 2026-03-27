import { useState, useCallback, useEffect, useRef } from "react";

export interface UseFieldOptions<T> {
  initialValue: T;
  validate?: (value: T) => string | undefined | Promise<string | undefined>;
  debounceMs?: number;
}

export interface UseFieldReturn<T> {
  value: T;
  error: string | undefined;
  touched: boolean;
  dirty: boolean;
  isValidating: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | T) => void;
  onBlur: () => void;
  setValue: (value: T) => void;
  setError: (error: string | undefined) => void;
  reset: () => void;
}

export const useField = <T,>({
  initialValue,
  validate,
  debounceMs = 0,
}: UseFieldOptions<T>): UseFieldReturn<T> => {
  const [value, setValueState] = useState<T>(initialValue);
  const [error, setError] = useState<string | undefined>();
  const [touched, setTouched] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  
  const validateRef = useRef(validate);
  validateRef.current = validate;

  const runValidation = useCallback(async (val: T) => {
    if (!validateRef.current) return;
    
    setIsValidating(true);
    try {
      const result = await validateRef.current(val);
      setError(result);
    } catch (err) {
      setError("Validation failed");
    } finally {
      setIsValidating(false);
    }
  }, []);

  // Debounced validation
  useEffect(() => {
    if (debounceMs > 0 && dirty) {
      const handler = setTimeout(() => {
        runValidation(value);
      }, debounceMs);
      return () => clearTimeout(handler);
    } else if (dirty) {
      runValidation(value);
    }
  }, [value, debounceMs, dirty, runValidation]);

  const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | T) => {
    const newVal = (e && typeof e === 'object' && 'target' in e) 
      ? (e.target.value as unknown as T) 
      : e;
      
    setValueState(newVal);
    setDirty(true);
  }, []);

  const onBlur = useCallback(() => {
    setTouched(true);
    runValidation(value);
  }, [value, runValidation]);

  const reset = useCallback(() => {
    setValueState(initialValue);
    setError(undefined);
    setTouched(false);
    setDirty(false);
  }, [initialValue]);

  return {
    value,
    error,
    touched,
    dirty,
    isValidating,
    onChange,
    onBlur,
    setValue: setValueState,
    setError,
    reset,
  };
};
