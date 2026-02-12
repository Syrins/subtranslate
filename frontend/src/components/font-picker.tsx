"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Search, Check, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const GOOGLE_FONTS = [
  "Abel",
  "Abril Fatface",
  "Alegreya",
  "Alegreya Sans",
  "Anton",
  "Archivo",
  "Archivo Black",
  "Arimo",
  "Arvo",
  "Asap",
  "Assistant",
  "Bangers",
  "Barlow",
  "Barlow Condensed",
  "Be Vietnam Pro",
  "Bebas Neue",
  "Bitter",
  "Black Ops One",
  "Bree Serif",
  "Cabin",
  "Cairo",
  "Cantarell",
  "Catamaran",
  "Caveat",
  "Chakra Petch",
  "Cinzel",
  "Comfortaa",
  "Concert One",
  "Cormorant Garamond",
  "Crimson Text",
  "DM Sans",
  "DM Serif Display",
  "Dancing Script",
  "Domine",
  "Dosis",
  "EB Garamond",
  "Exo 2",
  "Fira Code",
  "Fira Sans",
  "Fjalla One",
  "Fredoka One",
  "Gelasio",
  "Gloria Hallelujah",
  "Heebo",
  "Hind",
  "IBM Plex Mono",
  "IBM Plex Sans",
  "IBM Plex Serif",
  "Inconsolata",
  "Inter",
  "JetBrains Mono",
  "Josefin Sans",
  "Jost",
  "Kanit",
  "Karla",
  "Kaushan Script",
  "Lato",
  "Lexend",
  "Libre Baskerville",
  "Libre Franklin",
  "Lilita One",
  "Lobster",
  "Lora",
  "Lusitana",
  "Manrope",
  "Maven Pro",
  "Merriweather",
  "Merriweather Sans",
  "Montserrat",
  "Mukta",
  "Mulish",
  "Nanum Gothic",
  "Noto Sans",
  "Noto Sans JP",
  "Noto Sans KR",
  "Noto Sans SC",
  "Noto Sans TC",
  "Noto Serif",
  "Noto Serif JP",
  "Nunito",
  "Nunito Sans",
  "Old Standard TT",
  "Open Sans",
  "Orbitron",
  "Oswald",
  "Outfit",
  "Overpass",
  "Oxygen",
  "PT Sans",
  "PT Serif",
  "Pacifico",
  "Passion One",
  "Pathway Gothic One",
  "Permanent Marker",
  "Playfair Display",
  "Plus Jakarta Sans",
  "Poppins",
  "Press Start 2P",
  "Prompt",
  "Public Sans",
  "Quicksand",
  "Rajdhani",
  "Raleway",
  "Red Hat Display",
  "Righteous",
  "Roboto",
  "Roboto Condensed",
  "Roboto Mono",
  "Roboto Slab",
  "Rubik",
  "Russo One",
  "Saira",
  "Satisfy",
  "Secular One",
  "Signika",
  "Silkscreen",
  "Slabo 27px",
  "Source Code Pro",
  "Source Sans 3",
  "Source Serif 4",
  "Space Grotesk",
  "Space Mono",
  "Spectral",
  "Teko",
  "Titillium Web",
  "Ubuntu",
  "Ubuntu Mono",
  "Unbounded",
  "Varela Round",
  "Vollkorn",
  "Work Sans",
  "Yanone Kaffeesatz",
  "Zen Kaku Gothic New",
  "Zilla Slab",
];

const SYSTEM_FONTS = [
  "Arial",
  "Helvetica",
  "Verdana",
  "Georgia",
  "Times New Roman",
  "Courier New",
  "Impact",
  "Comic Sans MS",
  "Trebuchet MS",
  "Tahoma",
];

const loadedFonts = new Set<string>();

function loadGoogleFont(fontName: string) {
  if (loadedFonts.has(fontName) || SYSTEM_FONTS.includes(fontName)) return;
  loadedFonts.add(fontName);

  const link = document.createElement("link");
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@400;700&display=swap`;
  link.rel = "stylesheet";
  document.head.appendChild(link);
}

interface FontPickerProps {
  value: string;
  onChange: (font: string) => void;
}

export function FontPicker({ value, onChange }: FontPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadGoogleFont(value);
  }, [value]);

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setSearch("");
    }
  }, [open]);

  const allFonts = useMemo(
    () => [
      ...SYSTEM_FONTS.map((f) => ({ name: f, type: "system" as const })),
      ...GOOGLE_FONTS.map((f) => ({ name: f, type: "google" as const })),
    ],
    []
  );

  const filtered = useMemo(() => {
    if (!search) return allFonts;
    const q = search.toLowerCase();
    return allFonts.filter((f) => f.name.toLowerCase().includes(q));
  }, [search, allFonts]);

  const handleSelect = (fontName: string) => {
    loadGoogleFont(fontName);
    onChange(fontName);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-9 w-full justify-between text-xs font-normal"
        >
          <span className="truncate" style={{ fontFamily: value }}>
            {value}
          </span>
          <ChevronDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <div className="flex items-center border-b px-3 py-2">
          <Search className="mr-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Font ara..."
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
        </div>
        <ScrollArea className="h-[240px]">
          {filtered.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              Font bulunamadı
            </div>
          ) : (
            <div className="p-1">
              {/* System fonts section */}
              {filtered.some((f) => f.type === "system") && (
                <>
                  <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground">
                    SİSTEM FONTLARI
                  </div>
                  {filtered
                    .filter((f) => f.type === "system")
                    .map((font) => (
                      <button
                        key={font.name}
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent ${
                          value === font.name ? "bg-accent" : ""
                        }`}
                        onClick={() => handleSelect(font.name)}
                        onMouseEnter={() => loadGoogleFont(font.name)}
                      >
                        {value === font.name && (
                          <Check className="h-3 w-3 shrink-0 text-primary" />
                        )}
                        <span
                          className={`truncate ${value === font.name ? "" : "ml-5"}`}
                          style={{ fontFamily: font.name }}
                        >
                          {font.name}
                        </span>
                      </button>
                    ))}
                </>
              )}

              {/* Google fonts section */}
              {filtered.some((f) => f.type === "google") && (
                <>
                  <div className="mt-1 px-2 py-1.5 text-[10px] font-semibold text-muted-foreground">
                    GOOGLE FONTS
                  </div>
                  {filtered
                    .filter((f) => f.type === "google")
                    .map((font) => (
                      <button
                        key={font.name}
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent ${
                          value === font.name ? "bg-accent" : ""
                        }`}
                        onClick={() => handleSelect(font.name)}
                        onMouseEnter={() => loadGoogleFont(font.name)}
                      >
                        {value === font.name && (
                          <Check className="h-3 w-3 shrink-0 text-primary" />
                        )}
                        <span
                          className={`truncate ${value === font.name ? "" : "ml-5"}`}
                          style={{ fontFamily: font.name }}
                        >
                          {font.name}
                        </span>
                      </button>
                    ))}
                </>
              )}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
