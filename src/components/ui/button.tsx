import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-[2px] border text-xs font-bold uppercase tracking-[0.08em] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF6B35] disabled:pointer-events-none disabled:border-[#8A8D91] disabled:bg-[#8A8D91] disabled:text-[#0A192F]",
  {
    variants: {
      variant: {
        default: "border-[#FF6B35] bg-[#FF6B35] text-[#0A192F] hover:border-[#0A192F] hover:bg-[#0A192F] hover:text-[#F4F1EA]",
        outline: "border-[#0A192F] bg-transparent text-[#0A192F] hover:bg-[#0A192F] hover:text-[#F4F1EA]",
        ghost: "border-transparent bg-transparent text-[#0A192F] hover:border-[#0A192F]",
      },
      size: { default: "h-10 px-4", sm: "h-8 px-3", lg: "h-12 px-6", icon: "size-10" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({ className, variant, size, ...props }: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return <ButtonPrimitive className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
