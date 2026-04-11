"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Upload, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { CATEGORIES, PHASES, TYPOLOGIES, TERRAINS, ROOFS } from "@/shared/lib/utils";

interface User {
  id: string;
  name?: string | null;
  initials?: string | null;
  email: string;
}

interface AddProjectModalProps {
  open: boolean;
  onClose: () => void;
  users: User[];
  onSuccess: (project: unknown) => void;
}

export function AddProjectModal({
  open,
  onClose,
  users,
  onSuccess,
}: AddProjectModalProps) {
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: "",
    title: "",
    category: "Residenziale",
    phase: "ETUDE / AP",
    client: "",
    year: new Date().getFullYear().toString(),
    commune: "",
    typology: "",
    terrain: "",
    roof: "",
    description: "",
    pageLink: "",
  });

  const handleImageDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => setImagePreview(e.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => setImagePreview(e.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          year: form.year ? parseInt(form.year) : null,
          image: imagePreview,
        }),
      });

      if (res.ok) {
        const project = await res.json();
        onSuccess(project);
        setForm({
          code: "",
          title: "",
          category: "Residenziale",
          phase: "ETUDE / AP",
          client: "",
          year: new Date().getFullYear().toString(),
          commune: "",
          typology: "",
          terrain: "",
          roof: "",
          description: "",
          pageLink: "",
        });
        setImagePreview(null);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Project</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Image upload */}
          <div className="space-y-2">
            <Label>Project Image *</Label>
            <div
              onDrop={handleImageDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
                dragOver
                  ? "border-foreground bg-accent"
                  : "border-border hover:border-muted-foreground"
              }`}
            >
              {imagePreview ? (
                <div className="relative">
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="max-h-40 mx-auto rounded-lg object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setImagePreview(null)}
                    className="absolute top-1 right-1 p-1 bg-background/80 rounded-full"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div>
                  <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    <label className="cursor-pointer text-foreground font-medium hover:underline">
                      Click to upload
                      <input
                        type="file"
                        accept="image/png,image/jpg,image/jpeg,image/webp"
                        onChange={handleImageSelect}
                        className="hidden"
                      />
                    </label>{" "}
                    or drag here
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">PNG, JPG, WEBP (MAX. 10MB)</p>
                </div>
              )}
            </div>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Project Title *</Label>
            <Input
              id="title"
              placeholder="e.g. Modern Villa Lake Como"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </div>

          {/* Code */}
          <div className="space-y-2">
            <Label htmlFor="code">Project Code *</Label>
            <Input
              id="code"
              placeholder="e.g. DBS328"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              required
            />
          </div>

          {/* Category + Phase */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Category *</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm({ ...form, category: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Phase *</Label>
              <Select
                value={form.phase}
                onValueChange={(v) => setForm({ ...form, phase: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PHASES.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Client + Year + Commune */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="client">Client</Label>
              <Input
                id="client"
                placeholder="Client name"
                value={form.client}
                onChange={(e) => setForm({ ...form, client: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="year">Year</Label>
              <Input
                id="year"
                type="number"
                value={form.year}
                onChange={(e) => setForm({ ...form, year: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="commune">Commune</Label>
              <Input
                id="commune"
                placeholder="Commune name"
                value={form.commune}
                onChange={(e) => setForm({ ...form, commune: e.target.value })}
              />
            </div>
          </div>

          {/* Typology + Terrain + Roof */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Typology</Label>
              <Select
                value={form.typology}
                onValueChange={(v) => setForm({ ...form, typology: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona" />
                </SelectTrigger>
                <SelectContent>
                  {TYPOLOGIES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Terrain</Label>
              <Select
                value={form.terrain}
                onValueChange={(v) => setForm({ ...form, terrain: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona" />
                </SelectTrigger>
                <SelectContent>
                  {TERRAINS.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Roof</Label>
              <Select
                value={form.roof}
                onValueChange={(v) => setForm({ ...form, roof: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona" />
                </SelectTrigger>
                <SelectContent>
                  {ROOFS.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Project description..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
            />
          </div>

          {/* Page link */}
          <div className="space-y-2">
            <Label htmlFor="pageLink">Project Page Link</Label>
            <Input
              id="pageLink"
              type="url"
              placeholder="https://example.com/project..."
              value={form.pageLink}
              onChange={(e) => setForm({ ...form, pageLink: e.target.value })}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</>
              ) : (
                "Create Project"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
