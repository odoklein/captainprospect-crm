"use client";

import * as React from "react";
import { DayPicker } from "react-day-picker";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";

// Import react-day-picker base styles (required for layout)
import "react-day-picker/style.css";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
    className,
    classNames,
    showOutsideDays = true,
    ...props
}: CalendarProps) {
    return (
        <DayPicker
            locale={fr}
            showOutsideDays={showOutsideDays}
            className={cn("rdp-root p-3", className)}
            classNames={{
                months: "flex flex-col sm:flex-row gap-2",
                month: "flex flex-col gap-2",
                month_caption: "flex justify-center items-center h-9",
                caption_label: "text-sm font-medium text-ink",
                nav: "flex items-center gap-1",
                button_previous: "inline-flex items-center justify-center rounded-lg border border-line bg-surface h-9 w-9 text-ink-2 hover:bg-surface-2 disabled:opacity-50",
                button_next: "inline-flex items-center justify-center rounded-lg border border-line bg-surface h-9 w-9 text-ink-2 hover:bg-surface-2 disabled:opacity-50",
                weekdays: "flex",
                weekday:
                    "text-ink-3 rounded-md w-9 font-normal text-[0.8rem]",
                week: "flex w-full mt-1",
                day: "relative p-0 text-center text-sm focus-within:relative [&:has([aria-selected])]:bg-primary-50 first:[&:has([aria-selected])]:rounded-l-lg last:[&:has([aria-selected])]:rounded-r-lg",
                day_button: cn(
                    "inline-flex items-center justify-center rounded-lg h-9 w-9 font-normal",
                    "hover:bg-surface-3 focus:bg-surface-3 focus:outline-none",
                    "aria-selected:bg-primary-500 aria-selected:text-white aria-selected:opacity-100",
                    "text-ink"
                ),
                selected:
                    "bg-primary-500 text-white rounded-lg hover:bg-primary-600 focus:bg-primary-500",
                today: "bg-primary-50 text-primary-600 font-medium",
                outside:
                    "text-ink-4 opacity-75 aria-selected:bg-surface-3 aria-selected:text-ink-3",
                disabled: "text-ink-4 line-through",
                hidden: "invisible",
                ...classNames,
            }}
            {...props}
        />
    );
}
Calendar.displayName = "Calendar";

export { Calendar };
