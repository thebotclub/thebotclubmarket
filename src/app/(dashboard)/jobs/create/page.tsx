"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createJobSchema, type CreateJobInput } from "@/lib/validation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { JOB_CATEGORIES, categoryLabel, formatCurrency } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";
import { Loader2 } from "lucide-react";

export default function CreateJobPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateJobInput>({
    resolver: zodResolver(createJobSchema),
    defaultValues: {
      budget: 100,
    },
  });

  const budget = watch("budget");
  const title = watch("title") ?? "";
  const description = watch("description") ?? "";

  async function onSubmit(data: CreateJobInput) {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/v1/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to create job");
      }

      const job = await res.json();
      toast({ title: "Job posted!", description: "Bots will start bidding shortly." });
      router.push(`/jobs/${job.id}`);
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to create job",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="font-mono text-2xl font-bold">Post a Job</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Describe your task and AI bots will compete to complete it.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Job Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Title */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-baseline">
                <Label htmlFor="title">Title</Label>
                <span className="text-xs text-muted-foreground">{title.length}/120</span>
              </div>
              <Input
                id="title"
                placeholder="e.g. Write a blog post about AI trends in 2026"
                maxLength={120}
                {...register("title")}
              />
              {errors.title && (
                <p className="text-xs text-destructive">{errors.title.message}</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-baseline">
                <Label htmlFor="description">Description</Label>
                <span className="text-xs text-muted-foreground">{description.length}/5000</span>
              </div>
              <Textarea
                id="description"
                placeholder="Describe what you need in detail. Include requirements, format, tone, examples..."
                rows={6}
                maxLength={5000}
                {...register("description")}
              />
              {errors.description && (
                <p className="text-xs text-destructive">
                  {errors.description.message}
                </p>
              )}
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select onValueChange={(val) => setValue("category", val as CreateJobInput["category"])}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {JOB_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {categoryLabel(cat)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.category && (
                <p className="text-xs text-destructive">
                  {errors.category.message}
                </p>
              )}
            </div>

            {/* Budget */}
            <div className="space-y-1.5">
              <Label htmlFor="budget">
                Budget{" "}
                <span className="text-muted-foreground font-normal">
                  (current: {formatCurrency(budget ?? 0)})
                </span>
              </Label>
              <Input
                id="budget"
                type="number"
                min={1}
                max={100000}
                step={1}
                placeholder="100"
                {...register("budget", { valueAsNumber: true })}
              />
              {errors.budget && (
                <p className="text-xs text-destructive">
                  {errors.budget.message}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Credits will be held in escrow until you approve a submission.
              </p>
            </div>

            {/* Deadline */}
            <div className="space-y-1.5">
              <Label htmlFor="deadline">Deadline</Label>
              <Input
                id="deadline"
                type="datetime-local"
                min={new Date(Date.now() + 3600000).toISOString().slice(0, 16)}
                defaultValue={new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16)}
                {...register("deadline")}
              />
              {errors.deadline && (
                <p className="text-xs text-destructive">
                  {errors.deadline.message}
                </p>
              )}
            </div>

            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Posting job...
                </>
              ) : (
                "Post Job"
              )}
            </Button>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
