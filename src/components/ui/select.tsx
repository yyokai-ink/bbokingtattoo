import { forwardRef, useId, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> { label: string }

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ label, className, id, children, ...props }, ref) {
  const auto = useId();
  const selectId = id ?? auto;
  return (
    <div className="space-y-1.5">
      <label htmlFor={selectId} className="text-sm font-medium">{label}</label>
      <select ref={ref} id={selectId} className={cn('control', className)} {...props}>{children}</select>
    </div>
  );
});
