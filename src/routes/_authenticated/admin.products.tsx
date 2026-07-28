import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit, Loader2, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { AdminPageFrame } from "@/components/admin-nav";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getAdminCatalog,
  deleteAdminProducts,
  uploadAdminImage,
  upsertAdminCategory,
  upsertAdminProduct,
} from "@/lib/admin.functions";
import { formatCents } from "@/lib/format";

type ProductForm = {
  id?: string;
  name: string;
  slug: string;
  description: string;
  categoryId: string;
  priceRupees: number;
  mrpRupees: number;
  brand: string;
  unitLabel: string;
  imageUrl: string;
  stockQty: number;
  isActive: boolean;
  isFeatured: boolean;
  tags: string;
  hasVariants: boolean;
  variants: VariantForm[];
};

type VariantForm = {
  id?: string;
  optionName: string;
  optionValue: string;
  sku: string;
  /** True once an admin typed a custom SKU; auto-generation stops for that row. */
  skuTouched?: boolean;
  priceRupees: number;
  mrpRupees: number;
  stockQty: number;
  lowStockThreshold: number;
  imageUrl: string;
  isActive: boolean;
};

const emptyVariant: VariantForm = {
  optionName: "Weight",
  optionValue: "",
  sku: "",
  priceRupees: 0,
  mrpRupees: 0,
  stockQty: 0,
  lowStockThreshold: 10,
  imageUrl: "",
  isActive: true,
};

type CategoryForm = {
  id?: string;
  name: string;
  slug: string;
  imageUrl: string;
  sortOrder: number;
  tags: string;
};

const emptyProduct: ProductForm = {
  name: "",
  slug: "",
  description: "",
  categoryId: "__none",
  priceRupees: 0,
  mrpRupees: 0,
  brand: "",
  unitLabel: "each",
  imageUrl: "",
  stockQty: 0,
  isActive: true,
  isFeatured: false,
  tags: "",
  hasVariants: false,
  variants: [],
};

const emptyCategory: CategoryForm = {
  name: "",
  slug: "",
  imageUrl: "",
  sortOrder: 0,
  tags: "",
};

function parseTags(input: string): string[] {
  return input
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function skuToken(input: string, maxLength: number) {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, maxLength);
}

/** Builds a readable SKU like RICE-500G from the product name + variant name. */
function buildVariantSku(productName: string, optionValue: string, index: number) {
  const base = skuToken(productName, 10) || "ITEM";
  const suffix = skuToken(optionValue, 8) || `V${index + 1}`;
  return `${base}-${suffix}`;
}

/** Re-generates SKUs for every variant the admin has not manually edited. */
function withAutoSkus(productName: string, variants: VariantForm[]): VariantForm[] {
  const taken = new Set(
    variants.filter((v) => v.skuTouched && v.sku.trim()).map((v) => v.sku.trim().toUpperCase()),
  );
  return variants.map((variant, index) => {
    if (variant.skuTouched && variant.sku.trim()) return variant;
    let sku = buildVariantSku(productName, variant.optionValue, index);
    let attempt = 2;
    while (taken.has(sku)) {
      sku = `${buildVariantSku(productName, variant.optionValue, index)}-${attempt}`;
      attempt += 1;
    }
    taken.add(sku);
    return { ...variant, sku };
  });
}

function variantValidationMessage(variants: VariantForm[]) {
  if (variants.length === 0) return "Add at least one variant.";

  const skus = new Set<string>();
  const options = new Set<string>();
  for (const variant of variants) {
    if (!variant.optionValue.trim()) return "Every variant needs a name.";
    if (!variant.sku.trim()) return `Add a SKU for ${variant.optionValue || "every variant"}.`;

    const sku = variant.sku.trim().toLowerCase();
    if (skus.has(sku)) return `Duplicate SKU "${variant.sku}" is not allowed.`;
    skus.add(sku);

    const option = `${variant.optionName.trim().toLowerCase()}::${variant.optionValue
      .trim()
      .toLowerCase()}`;
    if (options.has(option)) {
      return `Duplicate variant "${variant.optionValue}" is not allowed.`;
    }
    options.add(option);
  }
  return null;
}

export const Route = createFileRoute("/_authenticated/admin/products")({
  head: () => ({ meta: [{ title: "Catalog - FEA Bazaar" }] }),
  component: AdminProductsPage,
});

function AdminProductsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [productForm, setProductForm] = useState<ProductForm>(emptyProduct);
  const [categoryForm, setCategoryForm] = useState<CategoryForm>(emptyCategory);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [recentlySavedProductId, setRecentlySavedProductId] = useState<string | null>(null);
  const productRowsRef = useRef(new Map<string, HTMLTableRowElement>());
  // Status pills should only "bump" in response to a real change, not on the
  // table's first paint (which would fire the animation on every visible row
  // at once). This flips true after mount, so only later re-renders animate.
  const badgeMotionRef = useRef(false);
  useEffect(() => {
    badgeMotionRef.current = true;
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-catalog"],
    queryFn: () => getAdminCatalog(),
  });

  const updateVariant = (index: number, patch: Partial<VariantForm>) =>
    setProductForm((current) => {
      const variants = current.variants.map((v, i) => (i === index ? { ...v, ...patch } : v));
      return { ...current, variants: withAutoSkus(current.name, variants) };
    });

  const addVariant = () =>
    setProductForm((current) => ({
      ...current,
      hasVariants: true,
      variants: withAutoSkus(current.name, [
        ...current.variants,
        {
          ...emptyVariant,
          optionName: current.variants[0]?.optionName || emptyVariant.optionName,
        },
      ]),
    }));

  const removeVariant = (index: number) =>
    setProductForm((current) => {
      const variant = current.variants[index];
      // An existing variant product must keep at least one variant. This
      // prevents a single click from silently converting it to a simple
      // product and archiving its complete variant history.
      if (variant?.id && current.variants.length === 1) return current;

      const variants = current.variants.filter((_, i) => i !== index);
      return {
        ...current,
        hasVariants: variants.length > 0,
        variants,
      };
    });

  const productMutation = useMutation({
    mutationFn: (input: ProductForm) =>
      upsertAdminProduct({
        data: {
          ...input,
          categoryId: input.categoryId === "__none" ? null : input.categoryId,
          description: input.description || null,
          imageUrl: input.imageUrl || null,
          tags: parseTags(input.tags),
          hasVariants: input.hasVariants,
          variants: input.hasVariants
            ? input.variants.map((v) => ({ ...v, imageUrl: v.imageUrl || null }))
            : [],
        },
      }),
    onSuccess: async (result, savedProduct) => {
      setSearch("");
      setProductForm(emptyProduct);
      setProductDialogOpen(false);
      setRecentlySavedProductId(result.productId ?? null);
      await queryClient.invalidateQueries({
        queryKey: ["admin-catalog"],
        refetchType: "active",
      });
      toast.success(`${savedProduct.name} saved and shown in the product list`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Product save failed"),
  });

  const categoryMutation = useMutation({
    mutationFn: (input: CategoryForm) =>
      upsertAdminCategory({
        data: {
          ...input,
          imageUrl: input.imageUrl || null,
          tags: parseTags(input.tags),
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-catalog"] });
      setCategoryForm(emptyCategory);
      setCategoryDialogOpen(false);
      toast.success("Category saved");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Category save failed"),
  });

  const products = useMemo(() => {
    const query = search.toLowerCase();
    return (data?.products ?? []).filter((product) => {
      if (!query) return true;
      return [product.name, product.slug, product.categories?.name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [data?.products, search]);

  useEffect(() => {
    if (!recentlySavedProductId) return;
    if (!data?.products.some((product) => product.id === recentlySavedProductId)) return;

    const frame = requestAnimationFrame(() => {
      productRowsRef.current
        .get(recentlySavedProductId)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    const timeout = window.setTimeout(() => setRecentlySavedProductId(null), 5000);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [data?.products, recentlySavedProductId]);

  const variantError = productForm.hasVariants
    ? variantValidationMessage(productForm.variants)
    : null;
  const variantTotalStock = productForm.variants
    .filter((variant) => variant.isActive)
    .reduce((total, variant) => total + variant.stockQty, 0);

  const visibleIds = products.map((product) => product.id);
  const selectedVisibleIds = visibleIds.filter((id) => selectedIds.includes(id));
  const allVisibleSelected =
    visibleIds.length > 0 && selectedVisibleIds.length === visibleIds.length;

  const toggleProduct = (id: string, checked: boolean) =>
    setSelectedIds((current) =>
      checked ? [...new Set([...current, id])] : current.filter((value) => value !== id),
    );

  const toggleAllVisible = (checked: boolean) =>
    setSelectedIds((current) =>
      checked
        ? [...new Set([...current, ...visibleIds])]
        : current.filter((id) => !visibleIds.includes(id)),
    );

  const deleteMutation = useMutation({
    mutationFn: (ids: string[]) => deleteAdminProducts({ data: { ids } }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["admin-catalog"] });
      setSelectedIds([]);
      setConfirmDeleteOpen(false);
      toast.success(`Deleted ${result.deleted} product${result.deleted === 1 ? "" : "s"}`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Delete failed"),
  });

  return (
    <AdminPageFrame
      title="Catalog"
      description="Manage products, categories, inventory, and storefront visibility."
    >
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error instanceof Error ? error.message : "Catalog could not load."}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setCategoryForm(emptyCategory);
                setCategoryDialogOpen(true);
              }}
            >
              <Plus />
              Add category
            </Button>
            <Button
              onClick={() => {
                setProductForm(emptyProduct);
                setProductDialogOpen(true);
              }}
            >
              <Plus />
              Add product
            </Button>
          </div>

          <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
            <DialogContent className="max-h-[85dvh] max-w-3xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{productForm.id ? "Edit product" : "New product"}</DialogTitle>
                <DialogDescription>
                  Set pricing, stock, images, and variants for this product.
                </DialogDescription>
              </DialogHeader>
              <form
                className="mt-4 space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  productMutation.mutate(productForm);
                }}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Name">
                    <Input
                      value={productForm.name}
                      aria-label="Product name"
                      onChange={(event) =>
                        setProductForm((current) => ({
                          ...current,
                          name: event.target.value,
                          variants: withAutoSkus(event.target.value, current.variants),
                        }))
                      }
                      required
                    />
                  </Field>
                  <Field label="Slug">
                    <Input
                      value={productForm.slug}
                      aria-label="Product slug"
                      onChange={(event) =>
                        setProductForm((current) => ({ ...current, slug: event.target.value }))
                      }
                      placeholder="Auto from name"
                    />
                  </Field>
                </div>
                <Field label="Description">
                  <Input
                    value={productForm.description}
                    aria-label="Product description"
                    onChange={(event) =>
                      setProductForm((current) => ({ ...current, description: event.target.value }))
                    }
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Category">
                    <Select
                      value={productForm.categoryId}
                      onValueChange={(categoryId) =>
                        setProductForm((current) => ({ ...current, categoryId }))
                      }
                    >
                      <SelectTrigger aria-label="Product category">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">No category</SelectItem>
                        {(data?.categories ?? []).map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Image">
                    <ImageUploadField
                      folder="products"
                      value={productForm.imageUrl}
                      onChange={(imageUrl) =>
                        setProductForm((current) => ({ ...current, imageUrl }))
                      }
                    />
                  </Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Brand">
                    <Input
                      value={productForm.brand}
                      aria-label="Product brand"
                      onChange={(event) =>
                        setProductForm((current) => ({ ...current, brand: event.target.value }))
                      }
                      placeholder="Leave empty for store default"
                    />
                  </Field>
                  <Field label="Unit">
                    <Input
                      value={productForm.unitLabel}
                      aria-label="Product unit"
                      onChange={(event) =>
                        setProductForm((current) => ({ ...current, unitLabel: event.target.value }))
                      }
                      required
                    />
                  </Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Selling Price (₹)">
                    <Input
                      type="number"
                      aria-label="Product selling price"
                      min={0}
                      step="0.01"
                      value={productForm.priceRupees}
                      disabled={productForm.hasVariants}
                      onChange={(event) =>
                        setProductForm((current) => ({
                          ...current,
                          priceRupees: Number(event.target.value),
                        }))
                      }
                      required
                    />
                  </Field>
                  <Field label="MRP (₹)">
                    <Input
                      type="number"
                      aria-label="Product MRP"
                      min={0}
                      step="0.01"
                      value={productForm.mrpRupees}
                      disabled={productForm.hasVariants}
                      onChange={(event) =>
                        setProductForm((current) => ({
                          ...current,
                          mrpRupees: Number(event.target.value),
                        }))
                      }
                      placeholder="For discount badge"
                    />
                  </Field>
                  <Field label="Stock">
                    <Input
                      type="number"
                      aria-label="Product stock"
                      min={0}
                      value={productForm.hasVariants ? variantTotalStock : productForm.stockQty}
                      disabled={productForm.hasVariants}
                      onChange={(event) =>
                        setProductForm((current) => ({
                          ...current,
                          stockQty: Number(event.target.value),
                        }))
                      }
                      required
                    />
                  </Field>
                </div>
                <div className="flex flex-wrap gap-4">
                  <ToggleField
                    label="Active"
                    checked={productForm.isActive}
                    onCheckedChange={(isActive) =>
                      setProductForm((current) => ({ ...current, isActive }))
                    }
                  />
                  <ToggleField
                    label="Featured"
                    checked={productForm.isFeatured}
                    onCheckedChange={(isFeatured) =>
                      setProductForm((current) => ({ ...current, isFeatured }))
                    }
                  />
                </div>
                <Field label="Tags (comma-separated, up to 6)">
                  <Input
                    value={productForm.tags}
                    aria-label="Product tags"
                    onChange={(event) =>
                      setProductForm((current) => ({ ...current, tags: event.target.value }))
                    }
                    placeholder="e.g. Cold-chain delivered, Fresh from source"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Leave empty to inherit tags from the selected category.
                  </p>
                </Field>
                <div className="rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">Variants</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Optional. Add sizes, weights, or packs with their own price and stock.
                      </p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={addVariant}>
                      <Plus />
                      Add variant
                    </Button>
                  </div>
                  {!productForm.hasVariants ? (
                    <div className="mt-3 rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
                      No variants added. The product will use the price and stock above.
                    </div>
                  ) : (
                    <div className="mt-3 space-y-3">
                      <div
                        className="rounded-md bg-primary/5 px-3 py-2 text-sm font-medium text-primary"
                        aria-live="polite"
                      >
                        {productForm.variants.length}{" "}
                        {productForm.variants.length === 1 ? "variant" : "variants"} · Total
                        sellable stock: {variantTotalStock}
                      </div>
                      {variantError && (
                        <div
                          role="alert"
                          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                        >
                          {variantError}
                        </div>
                      )}
                      {productForm.variants.map((variant, index) => (
                        <div
                          key={variant.id ?? `new-${index}`}
                          className="space-y-3 rounded-md border border-border bg-muted/30 p-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <h4 className="font-semibold">
                                {variant.optionValue || `Variant ${index + 1}`}
                              </h4>
                              <p className="text-xs text-muted-foreground">
                                {variant.isActive
                                  ? "Available to customers"
                                  : "Hidden from customers"}
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={Boolean(variant.id) && productForm.variants.length === 1}
                              title={
                                variant.id && productForm.variants.length === 1
                                  ? "Add another variant before archiving this one"
                                  : undefined
                              }
                              onClick={() => removeVariant(index)}
                            >
                              {variant.id ? "Archive" : "Remove"}
                            </Button>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Field label="Variant name">
                              <Input
                                value={variant.optionValue}
                                placeholder="e.g. 500 g"
                                aria-label={`Variant ${index + 1} name`}
                                required
                                onChange={(event) =>
                                  updateVariant(index, { optionValue: event.target.value })
                                }
                              />
                            </Field>
                            <Field label="SKU">
                              <Input
                                value={variant.sku}
                                placeholder="e.g. RICE-500G"
                                aria-label={`Variant ${index + 1} SKU`}
                                required
                                onChange={(event) => {
                                  const value = event.target.value.toUpperCase();
                                  // Clearing the field hands control back to auto-generation.
                                  updateVariant(index, {
                                    sku: value,
                                    skuTouched: value.trim().length > 0,
                                  });
                                }}
                              />
                              <p className="text-xs text-muted-foreground">
                                Auto-generated from the product and variant name. Edit to override,
                                clear to go back to automatic.
                              </p>
                            </Field>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Field label="Selling price (₹)">
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                value={variant.priceRupees}
                                aria-label={`Variant ${index + 1} selling price`}
                                required
                                onChange={(event) =>
                                  updateVariant(index, {
                                    priceRupees: Number(event.target.value) || 0,
                                  })
                                }
                              />
                            </Field>
                            <Field label="Stock">
                              <Input
                                type="number"
                                min={0}
                                value={variant.stockQty}
                                aria-label={`Variant ${index + 1} stock`}
                                required
                                onChange={(event) =>
                                  updateVariant(index, {
                                    stockQty: Number(event.target.value) || 0,
                                  })
                                }
                              />
                            </Field>
                          </div>
                          <details className="rounded-md border border-border bg-background">
                            <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
                              More settings
                            </summary>
                            <div className="space-y-3 border-t border-border p-3">
                              <div className="grid gap-3 sm:grid-cols-3">
                                <Field label="Variant type">
                                  <Input
                                    value={variant.optionName}
                                    placeholder="Weight"
                                    aria-label={`Variant ${index + 1} type`}
                                    required
                                    onChange={(event) =>
                                      updateVariant(index, { optionName: event.target.value })
                                    }
                                  />
                                </Field>
                                <Field label="MRP (₹)">
                                  <Input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={variant.mrpRupees}
                                    aria-label={`Variant ${index + 1} MRP`}
                                    onChange={(event) =>
                                      updateVariant(index, {
                                        mrpRupees: Number(event.target.value) || 0,
                                      })
                                    }
                                  />
                                </Field>
                                <Field label="Low-stock alert">
                                  <Input
                                    type="number"
                                    min={0}
                                    value={variant.lowStockThreshold}
                                    aria-label={`Variant ${index + 1} low-stock threshold`}
                                    required
                                    onChange={(event) =>
                                      updateVariant(index, {
                                        lowStockThreshold: Number(event.target.value) || 0,
                                      })
                                    }
                                  />
                                </Field>
                              </div>
                              <Field label="Variant image (optional)">
                                <ImageUploadField
                                  folder="products"
                                  value={variant.imageUrl}
                                  onChange={(imageUrl) => updateVariant(index, { imageUrl })}
                                />
                              </Field>
                              <ToggleField
                                label="Available"
                                checked={variant.isActive}
                                onCheckedChange={(isActive) => updateVariant(index, { isActive })}
                              />
                            </div>
                          </details>
                        </div>
                      ))}
                      <Button type="button" variant="outline" size="sm" onClick={addVariant}>
                        <Plus />
                        Add another variant
                      </Button>
                    </div>
                  )}
                </div>
                <Button type="submit" disabled={productMutation.isPending || Boolean(variantError)}>
                  {productMutation.isPending && <Loader2 className="animate-spin" />}
                  {productMutation.isPending ? "Saving..." : "Save product"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
            <DialogContent className="max-h-[85dvh] max-w-xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{categoryForm.id ? "Edit category" : "New category"}</DialogTitle>
                <DialogDescription>
                  Categories group products on the storefront and can supply default tags.
                </DialogDescription>
              </DialogHeader>
              <form
                className="mt-4 space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  categoryMutation.mutate(categoryForm);
                }}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Name">
                    <Input
                      value={categoryForm.name}
                      onChange={(event) =>
                        setCategoryForm((current) => ({ ...current, name: event.target.value }))
                      }
                      required
                    />
                  </Field>
                  <Field label="Slug">
                    <Input
                      value={categoryForm.slug}
                      onChange={(event) =>
                        setCategoryForm((current) => ({ ...current, slug: event.target.value }))
                      }
                      placeholder="Auto from name"
                    />
                  </Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                  <Field label="Image">
                    <ImageUploadField
                      folder="categories"
                      value={categoryForm.imageUrl}
                      onChange={(imageUrl) =>
                        setCategoryForm((current) => ({ ...current, imageUrl }))
                      }
                    />
                  </Field>
                  <Field label="Sort">
                    <Input
                      type="number"
                      min={0}
                      value={categoryForm.sortOrder}
                      onChange={(event) =>
                        setCategoryForm((current) => ({
                          ...current,
                          sortOrder: Number(event.target.value),
                        }))
                      }
                    />
                  </Field>
                </div>
                <Field label="Default tags (comma-separated, up to 6)">
                  <Input
                    value={categoryForm.tags}
                    onChange={(event) =>
                      setCategoryForm((current) => ({ ...current, tags: event.target.value }))
                    }
                    placeholder="e.g. Cold-chain delivered, Quality-checked"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Applied to products in this category that have no tags of their own.
                  </p>
                </Field>
                <Button type="submit" disabled={categoryMutation.isPending}>
                  {categoryMutation.isPending && <Loader2 className="animate-spin" />}
                  {categoryMutation.isPending ? "Saving..." : "Save category"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>

          <section className="space-y-4">
            <div className="rounded-md border border-border bg-card p-4 shadow-sm">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="pl-9"
                  placeholder="Search products"
                />
              </div>
              {selectedIds.length > 0 ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
                  <span className="text-sm text-muted-foreground">
                    {selectedIds.length} selected
                  </span>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])}>
                      Clear
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setConfirmDeleteOpen(true)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 />
                      Delete selected
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-4">
              <div className="overflow-hidden rounded-md border border-border bg-card shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allVisibleSelected}
                          onCheckedChange={(checked) => toggleAllVisible(checked === true)}
                          aria-label="Select all products"
                          disabled={visibleIds.length === 0}
                        />
                      </TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                          Loading...
                        </TableCell>
                      </TableRow>
                    ) : products.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                          <div className="animate-in fade-in slide-in-from-bottom-1 duration-300 fill-mode-both">
                            No products found.
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      products.map((product) => (
                        <TableRow
                          key={product.id}
                          ref={(node) => {
                            if (node) productRowsRef.current.set(product.id, node);
                            else productRowsRef.current.delete(product.id);
                          }}
                          className={
                            recentlySavedProductId === product.id
                              ? "bg-primary/10 ring-2 ring-inset ring-primary/40"
                              : undefined
                          }
                        >
                          <TableCell>
                            <Checkbox
                              checked={selectedIds.includes(product.id)}
                              onCheckedChange={(checked) =>
                                toggleProduct(product.id, checked === true)
                              }
                              aria-label={`Select ${product.name}`}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{product.name}</div>
                            <div className="text-xs text-muted-foreground">{product.slug}</div>
                          </TableCell>
                          <TableCell>{product.categories?.name ?? "None"}</TableCell>
                          <TableCell className="text-right">
                            {formatCents(product.price_cents)}
                          </TableCell>
                          <TableCell className="text-right">{product.stock_qty}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              <span
                                key={product.is_active ? "active" : "hidden"}
                                className={`${badgeMotionRef.current ? "animate-badge-bump " : ""}rounded-md border px-2 py-0.5 text-xs font-semibold ${
                                  product.is_active
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "border-gray-200 bg-gray-50 text-gray-600"
                                }`}
                              >
                                {product.is_active ? "Active" : "Hidden"}
                              </span>
                              {product.is_featured && (
                                <span
                                  className={`${badgeMotionRef.current ? "animate-badge-bump " : ""}rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700`}
                                >
                                  Featured
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              {product.is_active && (
                                <Button asChild variant="outline" size="sm">
                                  <Link to="/product/$slug" params={{ slug: product.slug }}>
                                    View
                                  </Link>
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  setProductForm({
                                    id: product.id,
                                    name: product.name,
                                    slug: product.slug,
                                    description: product.description ?? "",
                                    categoryId: product.category_id ?? "__none",
                                    priceRupees: product.price_rupees,
                                    mrpRupees: product.mrp_rupees ?? 0,
                                    brand: product.brand ?? "",
                                    unitLabel: product.unit_label,
                                    imageUrl: product.image_url ?? "",
                                    stockQty: product.stock_qty,
                                    isActive: product.is_active,
                                    isFeatured: product.is_featured,
                                    tags: (product.tags ?? []).join(", "),
                                    hasVariants: product.has_variants ?? false,
                                    variants: [...(product.product_variants ?? [])]
                                      .sort((a, b) => a.sort_order - b.sort_order)
                                      .map((v) => ({
                                        id: v.id,
                                        optionName: v.option_name,
                                        optionValue: v.option_value,
                                        sku: v.sku,
                                        skuTouched: true,
                                        priceRupees: v.price_cents / 100,
                                        mrpRupees: v.mrp_cents ? v.mrp_cents / 100 : 0,
                                        stockQty: v.stock_qty,
                                        lowStockThreshold: v.low_stock_threshold,
                                        imageUrl: v.image_url ?? "",
                                        isActive: v.is_active,
                                      })),
                                  })
                                }
                              >
                                <Edit />
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => {
                                  setSelectedIds([product.id]);
                                  setConfirmDeleteOpen(true);
                                }}
                              >
                                <Trash2 />
                                Delete
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="overflow-hidden rounded-md border border-border bg-card shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead>Slug</TableHead>
                      <TableHead className="text-right">Sort</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.categories ?? []).map((category) => (
                      <TableRow key={category.id}>
                        <TableCell className="font-medium">{category.name}</TableCell>
                        <TableCell>{category.slug}</TableCell>
                        <TableCell className="text-right">{category.sort_order}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setCategoryForm({
                                id: category.id,
                                name: category.name,
                                slug: category.slug,
                                imageUrl: category.image_url ?? "",
                                sortOrder: category.sort_order,
                                tags: (category.tags ?? []).join(", "),
                              })
                            }
                          >
                            <Edit />
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </section>
        </div>
      )}

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedIds.length} product{selectedIds.length === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the products, their variants, and their inventory records.
              Past orders keep their item details. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                deleteMutation.mutate(selectedIds);
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminPageFrame>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function ToggleField({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
      {label}
    </label>
  );
}

function ImageUploadField({
  folder,
  value,
  onChange,
}: {
  folder: "products" | "categories";
  value: string;
  onChange: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5 MB");
      return;
    }
    setUploading(true);
    try {
      const fileBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1] ?? "");
        };
        reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
        reader.readAsDataURL(file);
      });
      const { url } = await uploadAdminImage({
        data: {
          fileBase64,
          filename: file.name,
          contentType: file.type,
          folder,
        },
      });
      onChange(url);
      toast.success("Image uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      {value ? (
        <div className="flex items-start gap-3">
          <img
            src={value}
            alt="Preview"
            className="h-20 w-20 rounded-md border border-border object-cover"
          />
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              <Upload />
              {uploading ? "Uploading..." : "Replace"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange("")}
              disabled={uploading}
            >
              <X />
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          <Upload />
          {uploading ? "Uploading..." : "Upload image"}
        </Button>
      )}
      <Input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      <p className="text-xs text-muted-foreground">PNG, JPG, WebP up to 5 MB.</p>
    </div>
  );
}
