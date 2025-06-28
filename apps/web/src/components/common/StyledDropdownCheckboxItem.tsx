import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ComponentPropsWithoutRef, ElementRef } from "react";

// Props for our custom component, extending Radix's CheckboxItem props
export type StyledDropdownCheckboxItemProps = ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>;

const StyledDropdownCheckboxItem = React.forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  StyledDropdownCheckboxItemProps
>(({ className, children, checked, ...props }, ref) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    className={cn(
      // Core styles from shadcn/ui DropdownMenuCheckboxItem for the item itself
      "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    checked={checked}
    {...props}
  >
    <span className={cn(
      "pointer-events-none absolute left-2 flex h-3.5 w-3.5 items-center justify-center rounded-sm", // Base for the checkbox square
      "border border-primary", // Default border for the checkbox square - visible when unchecked
      "data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground" // Styles for when checked
      // If you want the border to change color or disappear when checked:
      // "data-[state=checked]:border-primary"
    )}>
      <DropdownMenuPrimitive.ItemIndicator>
        <CheckIcon className="h-4 w-4" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.CheckboxItem>
));
StyledDropdownCheckboxItem.displayName =
  DropdownMenuPrimitive.CheckboxItem.displayName;

export { StyledDropdownCheckboxItem }; 