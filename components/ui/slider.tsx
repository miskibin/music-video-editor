"use client"

import * as React from "react"
import { Slider as SliderPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  const _values = React.useMemo(() => {
    if (Array.isArray(value)) {
      return value;
    }
    if (Array.isArray(defaultValue)) {
      return defaultValue;
    }
    return [min];
  }, [value, defaultValue, min])

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        "relative flex w-full touch-none select-none items-center data-[orientation=horizontal]:min-h-9 data-[orientation=vertical]:min-h-40 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className={cn(
          "relative grow overflow-hidden rounded-full bg-zinc-700",
          "data-[orientation=horizontal]:h-2.5 data-[orientation=horizontal]:w-full",
          "data-[orientation=vertical]:h-full data-[orientation=vertical]:w-2",
        )}
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="absolute bg-zinc-200 data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full"
        />
      </SliderPrimitive.Track>
      {Array.from({ length: _values.length }, (_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          className="relative block size-[18px] shrink-0 cursor-grab rounded-full border-2 border-zinc-100 bg-white shadow-md ring-2 ring-zinc-950/40 transition-[box-shadow] hover:ring-zinc-300/80 active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:pointer-events-none disabled:opacity-50"
        />
      ))}
    </SliderPrimitive.Root>
  )
}

export { Slider }
