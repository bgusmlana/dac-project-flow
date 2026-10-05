import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';
import type * as React from 'react';
import { cn } from '@/lib/utils';

/** Pasang sekali di akar aplikasi: jeda muncul tooltip dibagi bersama. */
export function TooltipProvider(props: TooltipPrimitive.Provider.Props) {
  return <TooltipPrimitive.Provider delay={250} closeDelay={0} {...props} />;
}

/**
 * Tooltip modern (gelap, membulat, dengan panah) untuk satu elemen.
 * `children` harus satu elemen yang bisa menerima ref & props (Button, Link, button, dll.).
 */
export function Tip({
  label,
  side = 'top',
  children,
  className,
}: {
  label: React.ReactNode;
  side?: TooltipPrimitive.Positioner.Props['side'];
  children: React.ReactElement;
  className?: string;
}) {
  if (!label) return children;
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger render={children} />
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner side={side} sideOffset={7} className="z-[60]">
          <TooltipPrimitive.Popup
            className={cn(
              'max-w-64 origin-(--transform-origin) rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background shadow-lg transition-[opacity,transform] duration-150',
              'data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0',
              className,
            )}
          >
            {label}
            <TooltipPrimitive.Arrow className="data-[side=bottom]:-top-1 data-[side=left]:-right-1 data-[side=right]:-left-1 data-[side=top]:-bottom-1">
              <span className="block size-2 rotate-45 rounded-[1px] bg-foreground" />
            </TooltipPrimitive.Arrow>
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
