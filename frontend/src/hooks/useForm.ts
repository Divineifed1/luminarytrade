import { useState, useCallback, useMemo } from "react";
import { UseFieldReturn } from "./useField";

export interface UseFormOptions<T extends Record<string, any>> {
  fields: { [K in keyof T]: UseFieldReturn<T[K]> };
  onSubmit: (values: T) => Promise<void> | void;
}

export interface UseFormReturn<T extends Record<string, any>> {
  values: T;
  errors: Partial<Record<keyof T, string>>;
  touched: Partial<Record<keyof T, boolean>>;
  isValid: boolean;
  isDirty: boolean;
  isSubmitting: boolean;
  handleSubmit: (e?: React.FormEvent) => Promise<void>;
  reset: () => void;
}

export const useForm = <T extends Record<string, any>>({
  fields,
  onSubmit,
}: UseFormOptions<T>): UseFormReturn<T> => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const values = useMemo(() => {
    const v = {} as T;
    for (const key in fields) {
      v[key] = fields[key].value;
    }
    return v;
  }, [fields]);

  const errors = useMemo(() => {
    const e = {} as Partial<Record<keyof T, string>>;
    for (const key in fields) {
      if (fields[key].error) e[key] = fields[key].error;
    }
    return e;
  }, [fields]);

  const touched = useMemo(() => {
    const t = {} as Partial<Record<keyof T, boolean>>;
    for (const key in fields) {
      t[key] = fields[key].touched;
    }
    return t;
  }, [fields]);

  const isValid = useMemo(() => {
    return Object.values(fields).every((f) => !f.error);
  }, [fields]);

  const isDirty = useMemo(() => {
    return Object.values(fields).some((f) => f.dirty);
  }, [fields]);

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    // Touch all fields on submit
    for (const key in fields) {
      fields[key].onBlur();
    }

    if (!isValid) return;

    setIsSubmitting(true);
    try {
      await onSubmit(values);
    } finally {
      setIsSubmitting(false);
    }
  }, [fields, isValid, onSubmit, values]);

  const reset = useCallback(() => {
    for (const key in fields) {
      fields[key].reset();
    }
  }, [fields]);

  return {
    values,
    errors,
    touched,
    isValid,
    isDirty,
    isSubmitting,
    handleSubmit,
    reset,
  };
};
