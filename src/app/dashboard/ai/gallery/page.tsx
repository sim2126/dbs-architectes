"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Brain,
  Building2,
  Filter,
  Image as ImageIcon,
  Layers3,
  Palette,
  Search,
  Sparkles,
  Tag,
} from "lucide-react";
import { Badge } from "@/ui/components/badge";
import { Button } from "@/ui/components/button";
import { Card, CardContent } from "@/ui/components/card";
import { Input } from "@/ui/components/input";

const SAMPLE_IMAGES = [
  {
    id: "1",
    title: "Villa Moderna - Facciata Nord",
    type: "Render",
    tags: ["villa", "modern", "wood", "glass"],
    colors: ["white", "grey", "brown"],
    materials: ["Wood", "Glass", "Concrete"],
    floors: 2,
    year: 2024,
    style: "Modern",
    shape: "Rectangular",
    project: "DBS328",
    insight: "Warm material palette with strong glazing rhythm",
  },
  {
    id: "2",
    title: "Condominium - Urban Perspective",
    type: "Render",
    tags: ["condominium", "urban", "concrete"],
    colors: ["grey", "white"],
    materials: ["Concrete", "Glass"],
    floors: 6,
    year: 2023,
    style: "Contemporary",
    shape: "L-form",
    project: "DBS283-10",
    insight: "High-density facade with compact balcony cadence",
  },
  {
    id: "3",
    title: "Semi-Detached Villa - Exterior",
    type: "Facade",
    tags: ["semi-detached", "natural", "stone"],
    colors: ["beige", "green", "grey"],
    materials: ["Stone", "Wood", "Plaster"],
    floors: 3,
    year: 2024,
    style: "Regional contemporary",
    shape: "Compact",
    project: "DBS2024-66",
    insight: "Good reference for mixed stone and plaster compositions",
  },
  {
    id: "4",
    title: "Mountain Residence - South View",
    type: "Facade",
    tags: ["mountain", "wood", "pitched-roof"],
    colors: ["brown", "grey"],
    materials: ["Wood", "Stone"],
    floors: 2,
    year: 2022,
    style: "Alpine",
    shape: "Pitched roof",
    project: "DBS182",
    insight: "Strong alpine precedent for sloped sites and timber use",
  },
];

const COLOR_FILTERS = ["white", "grey", "brown", "beige", "green", "black"];
const MATERIAL_FILTERS = ["Wood", "Glass", "Concrete", "Stone", "Plaster"];
const SHAPE_FILTERS = ["Rectangular", "L-form", "Compact", "Pitched roof"];

export default function VisualGalleryPage() {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [activeColors, setActiveColors] = useState<string[]>([]);
  const [activeMaterials, setActiveMaterials] = useState<string[]>([]);
  const [activeShapes, setActiveShapes] = useState<string[]>([]);

  const filteredImages = useMemo(() => {
    return SAMPLE_IMAGES.filter((image) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        image.title.toLowerCase().includes(q) ||
        image.tags.some((tag) => tag.includes(q)) ||
        image.materials.some((material) => material.toLowerCase().includes(q)) ||
        image.style.toLowerCase().includes(q);

      const matchesColors =
        activeColors.length === 0 || activeColors.some((color) => image.colors.includes(color));
      const matchesMaterials =
        activeMaterials.length === 0 ||
        activeMaterials.some((material) => image.materials.includes(material));
      const matchesShapes =
        activeShapes.length === 0 || activeShapes.includes(image.shape);

      return matchesSearch && matchesColors && matchesMaterials && matchesShapes;
    });
  }, [activeColors, activeMaterials, activeShapes, search]);

  function toggleValue(values: string[], value: string, setter: (next: string[]) => void) {
    setter(values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value]);
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f9fbff_0%,#ffffff_34%,#f8f8f8_100%)] p-6">
      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="border-border bg-card shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
            <CardContent className="p-5">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-semibold">AI filters</p>
              </div>

              <div className="mt-4 space-y-4">
                <FilterGroup
                  title="Dominant colors"
                  values={COLOR_FILTERS}
                  active={activeColors}
                  onToggle={(value) => toggleValue(activeColors, value, setActiveColors)}
                />
                <FilterGroup
                  title="Materials"
                  values={MATERIAL_FILTERS}
                  active={activeMaterials}
                  onToggle={(value) => toggleValue(activeMaterials, value, setActiveMaterials)}
                />
                <FilterGroup
                  title="Shapes"
                  values={SHAPE_FILTERS}
                  active={activeShapes}
                  onToggle={(value) => toggleValue(activeShapes, value, setActiveShapes)}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
            <CardContent className="p-5">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-blue-600" />
                <p className="text-sm font-semibold">What the AI adds</p>
              </div>
              <div className="mt-4 space-y-3">
                {[
                  "Auto-tag materials, colors, and facade patterns",
                  "Surface visually similar precedents instantly",
                  "Reuse past work in client presentations and design reviews",
                ].map((item) => (
                  <div key={item} className="rounded-2xl border border-border bg-card p-3 text-sm leading-6 text-muted-foreground">
                    {item}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="overflow-hidden border-border bg-card shadow-[0_22px_60px_rgba(15,23,42,0.08)]">
            <CardContent className="p-0">
              <div className="bg-[linear-gradient(135deg,#0f172a_0%,#1e3a8a_56%,#0f766e_100%)] px-6 py-8 text-white">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <Badge className="bg-white/12 text-[11px] text-white">Visual intelligence</Badge>
                    <h1 className="mt-4 text-4xl font-semibold tracking-tight">Visual Gallery AI</h1>
                    <p className="mt-3 max-w-3xl text-sm leading-7 text-white/74">
                      An AI-powered repository for renders, facades, materials, and architectural references produced by DBS.
                    </p>
                  </div>
                  <Badge variant="success" className="text-xs">
                    Auto-tagging ready
                  </Badge>
                </div>

                <div className="mt-6 flex flex-col gap-3 md:flex-row">
                  <div className="relative flex-1">
                    <Sparkles className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/65" />
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Example: warm-toned facades with wood and stone between 2022 and 2024"
                      className="h-12 rounded-2xl border-white/15 bg-white/10 pl-10 text-white placeholder:text-white/55"
                    />
                  </div>
                  <Button
                    onClick={() => setSearch(query)}
                    className="h-12 rounded-2xl bg-white text-slate-900 hover:bg-white/90"
                  >
                    <Search className="mr-2 h-4 w-4" />
                    Search with AI
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 border-t border-border p-6 md:grid-cols-3">
                {[
                  { label: "Assets indexed", value: "1,240" },
                  { label: "Material classes", value: "37" },
                  { label: "Design patterns found", value: "112" },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl border border-border bg-card p-4">
                    <p className="text-2xl font-semibold">{item.value}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{item.label}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            <Card className="border-border bg-card shadow-[0_18px_45px_rgba(15,23,42,0.05)] md:col-span-2">
              <CardContent className="p-5">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-blue-600" />
                  <p className="text-sm font-semibold">Interpreted AI query</p>
                </div>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  The model translates natural language into structured filters such as color palette, material family, building scale, and visual rhythm.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {["warm tones", "wood + stone", "2-6 floors", "recent precedents"].map((chip) => (
                    <Badge key={chip} variant="outline" className="rounded-full bg-slate-50 px-3 py-1 text-[11px]">
                      {chip}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border bg-card shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
              <CardContent className="p-5">
                <div className="flex items-center gap-2">
                  <Layers3 className="h-4 w-4 text-emerald-600" />
                  <p className="text-sm font-semibold">Best use cases</p>
                </div>
                <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                  <p>Client presentations</p>
                  <p>Facade direction reviews</p>
                  <p>Fast precedent retrieval</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredImages.map((image, index) => (
              <motion.div
                key={image.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.06 }}
              >
                <Card className="overflow-hidden border-border bg-card shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
                  <CardContent className="p-0">
                    <div className="relative aspect-[4/3] border-b border-border bg-[linear-gradient(135deg,#eef2ff_0%,#f5f7fb_42%,#edf7f1_100%)]">
                      <div className="absolute left-4 top-4 flex gap-2">
                        <Badge className="bg-black/60 text-[10px] text-white">{image.type}</Badge>
                        <Badge className="bg-black/60 text-[10px] text-white">{image.floors} floors</Badge>
                      </div>
                      <div className="flex h-full items-center justify-center">
                        <ImageIcon className="h-10 w-10 text-slate-400" />
                      </div>
                    </div>

                    <div className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{image.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {image.project} · {image.year} · {image.style}
                          </p>
                        </div>
                        <Badge variant="secondary" className="text-[10px]">
                          {image.shape}
                        </Badge>
                      </div>

                      <div className="mt-4 space-y-3">
                        <MetadataRow icon={Palette} label="Colors" value={image.colors.join(", ")} />
                        <MetadataRow icon={Layers3} label="Materials" value={image.materials.join(", ")} />
                        <MetadataRow icon={Tag} label="AI insight" value={image.insight} />
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {image.tags.map((tag) => (
                          <Badge key={tag} variant="outline" className="rounded-full bg-slate-50 text-[10px]">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <Card className="border-border bg-card shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
            <CardContent className="grid gap-4 p-6 md:grid-cols-2">
              {[
                {
                  title: "Recurring facade rhythm",
                  text: "Vertical window cadence appears strongly in mid-density urban residential work and can be surfaced automatically as a reusable pattern.",
                },
                {
                  title: "Material pairing insight",
                  text: "Wood plus stone dominates alpine and slope-related references, while concrete plus glass clusters around urban condominium projects.",
                },
              ].map((item) => (
                <div key={item.title} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-blue-600" />
                    <p className="text-sm font-semibold">{item.title}</p>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">{item.text}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function FilterGroup({
  title,
  values,
  active,
  onToggle,
}: {
  title: string;
  values: string[];
  active: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-2">
        {values.map((value) => (
          <button
            key={value}
            onClick={() => onToggle(value)}
            className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
              active.includes(value)
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-card hover:bg-accent"
            }`}
          >
            {value}
          </button>
        ))}
      </div>
    </div>
  );
}

function MetadataRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
        <p className="mt-1 text-sm leading-6 text-slate-700">{value}</p>
      </div>
    </div>
  );
}
