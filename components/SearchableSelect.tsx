"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Search, Check } from "lucide-react";

type Option = {
  value: string;
  label: string;
};

type Props = {
  options: Option[];
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  visibleOptionCount?: number;
};

export function SearchableSelect({ options, value, onChange, placeholder = "Select...", className = "", disabled = false, visibleOptionCount = 7 }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Alphabetical sort of options
  const sortedOptions = [...options].sort((a, b) => a.label.localeCompare(b.label));

  const selectedOption = sortedOptions.find((opt) => opt.value === value);
  const displayLabel = selectedOption ? selectedOption.label : placeholder;

  const filteredOptions = sortedOptions.filter((opt) =>
    opt.label.toLowerCase().includes(search.toLowerCase())
  );
  const listMaxHeightPx = Math.max(1, visibleOptionCount) * 36;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen((p) => !p);
          if (!open) setSearch("");
        }}
        className={`w-full flex items-center justify-between px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm ${
          disabled ? 'bg-gray-50 cursor-not-allowed opacity-75' : 'cursor-pointer'
        }`}
      >
        <span className="block truncate text-gray-700">
          {displayLabel}
        </span>
        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
          <ChevronDown className="h-4 w-4 text-gray-400" aria-hidden="true" />
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md bg-white shadow-lg border border-gray-200">
          <div className="flex items-center px-3 py-2 border-b border-gray-100">
            <Search className="h-4 w-4 text-gray-400 mr-2" />
            <input
              ref={inputRef}
              type="text"
              className="block w-full border-0 p-0 text-gray-900 placeholder-gray-500 focus:ring-0 sm:text-sm"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          
          <ul className="overflow-auto py-1 text-base sm:text-sm" style={{ maxHeight: `${listMaxHeightPx}px` }}>
            {filteredOptions.length === 0 ? (
              <li className="relative cursor-default select-none py-2 pl-3 pr-9 text-gray-500">
                No results found
              </li>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <li
                    key={opt.value}
                    className={`relative cursor-default select-none py-2 pl-3 pr-9 hover:bg-gray-100 ${
                      isSelected ? "bg-blue-50 text-blue-900 font-medium" : "text-gray-900"
                    }`}
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                  >
                    <span className="block truncate">{opt.label}</span>
                    {isSelected && (
                      <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-blue-600">
                        <Check className="h-4 w-4" aria-hidden="true" />
                      </span>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
