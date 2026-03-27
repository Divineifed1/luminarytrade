import React from "react";
import { 
  Box, 
  Button, 
  CircularProgress, 
  Alert, 
  Snackbar,
  Paper,
  Typography
} from "@mui/material";
import { UseFormReturn } from "../../hooks/useForm";

export interface FormProps<T extends Record<string, any>> {
  form: UseFormReturn<T>;
  children: React.ReactNode;
  title?: string;
  submitLabel?: string;
  errorMessage?: string | null;
  onSuccess?: () => void;
}

export const Form = <T extends Record<string, any>>({
  form,
  children,
  title,
  submitLabel = "Submit",
  errorMessage,
}: FormProps<T>) => {
  const { handleSubmit, isSubmitting, isValid, errors, touched } = form;

  const hasGlobalErrors = Object.keys(errors).some(key => touched[key as keyof T]);

  return (
    <Paper elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
      {title && (
        <Typography variant="h6" sx={{ mb: 3 }}>
          {title}
        </Typography>
      )}

      {errorMessage && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {errorMessage}
        </Alert>
      )}

      <form onSubmit={handleSubmit} noValidate>
        {children}

        <Box sx={{ mt: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Button
            type="submit"
            variant="contained"
            color="primary"
            fullWidth
            disabled={isSubmitting || (!isValid && Object.keys(touched).length > 0)}
            sx={{ py: 1.5, position: 'relative' }}
          >
            {isSubmitting ? (
              <CircularProgress size={24} sx={{ position: 'absolute' }} />
            ) : (
              submitLabel
            )}
            <span style={{ opacity: isSubmitting ? 0 : 1 }}>{submitLabel}</span>
          </Button>
        </Box>
      </form>

      <Snackbar 
        open={hasGlobalErrors && !isSubmitting} 
        autoHideDuration={6000}
      >
        <Alert severity="error" variant="filled" sx={{ width: '100%' }}>
          Please check the form for errors.
        </Alert>
      </Snackbar>
    </Paper>
  );
};

export default Form;
