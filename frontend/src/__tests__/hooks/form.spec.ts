import { renderHook, act } from "@testing-library/react";
import { useField } from "../../hooks/useField";
import { useForm } from "../../hooks/useForm";
import { validateEmail, validateAmount, checkPasswordStrength } from "../../validation/rules";

describe("Validation Rules", () => {
  test("validateEmail", () => {
    expect(validateEmail("test@example.com")).toBe(true);
    expect(validateEmail("invalid-email")).toBe(false);
  });

  test("validateAmount", () => {
    expect(validateAmount("10.5")).toBe(true);
    expect(validateAmount("-1")).toBe(false);
    expect(validateAmount("10.12345678")).toBe(false); // Max 7 decimals
  });

  test("checkPasswordStrength", () => {
    const weak = checkPasswordStrength("pass");
    expect(weak.score).toBeLessThan(3);
    
    const strong = checkPasswordStrength("StrongPass123!");
    expect(strong.score).toBe(4);
  });
});

describe("useField Hook", () => {
  test("initializes with initialValue", () => {
    const { result } = renderHook(() => useField({ initialValue: "test" }));
    expect(result.current.value).toBe("test");
    expect(result.current.touched).toBe(false);
  });

  test("updates value on change", () => {
    const { result } = renderHook(() => useField({ initialValue: "" }));
    act(() => {
      result.current.onChange("new value");
    });
    expect(result.current.value).toBe("new value");
    expect(result.current.dirty).toBe(true);
  });

  test("validates value", async () => {
    const validate = (val: string) => val.length < 3 ? "Too short" : undefined;
    const { result } = renderHook(() => useField({ initialValue: "", validate }));
    
    await act(async () => {
      result.current.onChange("ab");
      result.current.onBlur();
    });
    
    expect(result.current.error).toBe("Too short");
    expect(result.current.touched).toBe(true);
  });
});

describe("useForm Hook", () => {
  test("aggregates field values and validity", async () => {
    const emailField = renderHook(() => useField({ 
      initialValue: "", 
      validate: (v) => !v.includes("@") ? "Invalid" : undefined 
    })).result;
    
    const { result } = renderHook(() => useForm({
      fields: { email: emailField.current as any },
      onSubmit: jest.fn()
    }));

    expect(result.current.isValid).toBe(false); // email is invalid initially (if we check it)
    
    // Note: In our implementation, error is only set after runValidation
    // Initial error state depends on how we trigger it.
  });
});
