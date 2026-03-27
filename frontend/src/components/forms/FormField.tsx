import React from "react";
import { 
  TextField, 
  TextFieldProps, 
  Tooltip, 
  InputAdornment, 
  Box,
  Typography
} from "@mui/material";
import { 
  Error as ErrorIcon, 
  CheckCircle as ValidIcon 
} from "@mui/icons-material";
import { UseFieldReturn } from "../../hooks/useField";

export interface FormFieldProps extends Omit<TextFieldProps, 'onChange' | 'onBlur' | 'value' | 'error'> {
  field: UseFieldReturn<any>;
  label: string;
  tooltip?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  field,
  label,
  tooltip,
  helperText,
  ...props
}) => {
  const { value, error, touched, onChange, onBlur, isValidating } = field;
  const hasError = !!(touched && error);
  const isValid = !!(touched && !error && !isValidating && value);

  return (
    <Box sx={{ mb: 2 }}>
      <Tooltip title={hasError ? error : (tooltip || "")} arrow disableHoverListener={!hasError && !tooltip}>
        <TextField
          {...props}
          fullWidth
          label={label}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          error={hasError}
          helperText={hasError ? error : helperText}
          InputProps={{
            ...props.InputProps,
            endAdornment: (
              <InputAdornment position="end">
                {isValidating ? (
                  <Box sx={{ display: 'flex' }} /> // Loading state if needed
                ) : hasError ? (
                  <ErrorIcon color="error" fontSize="small" />
                ) : isValid ? (
                  <ValidIcon color="success" fontSize="small" />
                ) : null}
                {props.InputProps?.endAdornment}
              </InputAdornment>
            ),
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              ...(isValid && {
                '& fieldset': {
                  borderColor: 'success.main',
                },
              }),
            },
            ...props.sx
          }}
        />
      </Tooltip>
    </Box>
  );
};

export default FormField;
