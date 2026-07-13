import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { AdminPageFrame } from "@/components/admin-nav";
import { Button } from "@/components/ui/button";
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
import { getAdminCatalog, upsertAdminCategory, upsertAdminProduct } from "@/lib/admin.functions";
import { formatCents } from "@/lib/format";

type ProductForm = {
  id?: string;
  name: string;
  slug: string;
  description: string;
  categoryId: string;
  priceRupees: number;
  unitLabel: string;
  imageUrl: string;
  stockQty: number;
  isActive: boolean;
  isFeatured: boolean;
};

type CategoryForm = {
  id?: string;
  name: string;
  slug: string;
  imageUrl: string;
  sortOrder: number;
};

const emptyProduct: ProductForm = {
  name: "",
  slug: "",
  description: "",
  categoryId: "__none",
  priceRupees: 0,
  unitLabel: "each",
  imageUrl: "",
  stockQty: 0,
  isActive: true,
  isFeatured: false,
};

const emptyCategory: CategoryForm = {
  name: "",
  slug: "",
  imageUrl: "",
  sortOrder: 0,
};

export const Route = createFileRoute("/_authenticated/admin/products")({
  head: () => ({ meta: [{ title: "Catalog - FEABazaar" }] }),
  component: AdminProductsPage,
});

function AdminProductsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [productForm, setProductForm] = useState<ProductForm>(emptyProduct);
  const [categoryForm, setCategoryForm] = useState<CategoryForm>(emptyCategory);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-catalog"],
    queryFn: () => getAdminCatalog(),
  });

  const productMutation = useMutation({
    mutationFn: (input: ProductForm) =>
      upsertAdminProduct({
        data: {
          ...input,
          categoryId: input.categoryId === "__none" ? null : input.categoryId,
          description: input.description || null,
          imageUrl: input.imageUrl || null,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-catalog"] });
      setProductForm(emptyProduct);
      toast.success("Product saved");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Product save failed"),
  });

  const categoryMutation = useMutation({
    mutationFn: (input: CategoryForm) =>
      upsertAdminCategory({
        data: {
          ...input,
          imageUrl: input.imageUrl || null,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-catalog"] });
      setCategoryForm(emptyCategory);
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

  return (
    <AdminPageFrame title="Catalog" description="Manage products, categories, inventory, and storefront visibility.">
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error instanceof Error ? error.message : "Catalog could not load."}
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
          <section className="space-y-4">
            <div className="rounded-md border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-xl font-semibold">
                  {productForm.id ? "Edit product" : "New product"}
                </h2>
                {productForm.id && (
                  <Button variant="outline" size="sm" onClick={() => setProductForm(emptyProduct)}>
                    <Plus />
                    New
                  </Button>
                )}
              </div>
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
                      onChange={(event) => setProductForm((current) => ({ ...current, name: event.target.value }))}
                      required
                    />
                  </Field>
                  <Field label="Slug">
                    <Input
                      value={productForm.slug}
                      onChange={(event) => setProductForm((current) => ({ ...current, slug: event.target.value }))}
                      placeholder="Auto from name"
                    />
                  </Field>
                </div>
                <Field label="Description">
                  <Input
                    value={productForm.description}
                    onChange={(event) =>
                      setProductForm((current) => ({ ...current, description: event.target.value }))
                    }
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Category">
                    <Select
                      value={productForm.categoryId}
                      onValueChange={(categoryId) => setProductForm((current) => ({ ...current, categoryId }))}
                    >
                      <SelectTrigger>
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
                  <Field label="Image URL">
                    <Input
                      value={productForm.imageUrl}
                      onChange={(event) => setProductForm((current) => ({ ...current, imageUrl: event.target.value }))}
                    />
                  </Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Price">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={productForm.priceRupees}
                      onChange={(event) =>
                        setProductForm((current) => ({ ...current, priceRupees: Number(event.target.value) }))
                      }
                      required
                    />
                  </Field>
                  <Field label="Unit">
                    <Input
                      value={productForm.unitLabel}
                      onChange={(event) =>
                        setProductForm((current) => ({ ...current, unitLabel: event.target.value }))
                      }
                      required
                    />
                  </Field>
                  <Field label="Stock">
                    <Input
                      type="number"
                      min={0}
                      value={productForm.stockQty}
                      onChange={(event) =>
                        setProductForm((current) => ({ ...current, stockQty: Number(event.target.value) }))
                      }
                      required
                    />
                  </Field>
                </div>
                <div className="flex flex-wrap gap-4">
                  <ToggleField
                    label="Active"
                    checked={productForm.isActive}
                    onCheckedChange={(isActive) => setProductForm((current) => ({ ...current, isActive }))}
                  />
                  <ToggleField
                    label="Featured"
                    checked={productForm.isFeatured}
                    onCheckedChange={(isFeatured) => setProductForm((current) => ({ ...current, isFeatured }))}
                  />
                </div>
                <Button type="submit" disabled={productMutation.isPending}>
                  {productMutation.isPending ? "Saving..." : "Save product"}
                </Button>
              </form>
            </div>

            <div className="rounded-md border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-xl font-semibold">
                  {categoryForm.id ? "Edit category" : "New category"}
                </h2>
                {categoryForm.id && (
                  <Button variant="outline" size="sm" onClick={() => setCategoryForm(emptyCategory)}>
                    <Plus />
                    New
                  </Button>
                )}
              </div>
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
                      onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))}
                      required
                    />
                  </Field>
                  <Field label="Slug">
                    <Input
                      value={categoryForm.slug}
                      onChange={(event) => setCategoryForm((current) => ({ ...current, slug: event.target.value }))}
                      placeholder="Auto from name"
                    />
                  </Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                  <Field label="Image URL">
                    <Input
                      value={categoryForm.imageUrl}
                      onChange={(event) => setCategoryForm((current) => ({ ...current, imageUrl: event.target.value }))}
                    />
                  </Field>
                  <Field label="Sort">
                    <Input
                      type="number"
                      min={0}
                      value={categoryForm.sortOrder}
                      onChange={(event) =>
                        setCategoryForm((current) => ({ ...current, sortOrder: Number(event.target.value) }))
                      }
                    />
                  </Field>
                </div>
                <Button type="submit" disabled={categoryMutation.isPending}>
                  {categoryMutation.isPending ? "Saving..." : "Save category"}
                </Button>
              </form>
            </div>
          </section>

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
            </div>

            <div className="overflow-hidden rounded-md border border-border bg-card shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow>
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
                      <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : products.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                        No products found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    products.map((product) => (
                      <TableRow key={product.id}>
                        <TableCell>
                          <div className="font-medium">{product.name}</div>
                          <div className="text-xs text-muted-foreground">{product.slug}</div>
                        </TableCell>
                        <TableCell>{product.categories?.name ?? "None"}</TableCell>
                        <TableCell className="text-right">{formatCents(product.price_cents)}</TableCell>
                        <TableCell className="text-right">{product.stock_qty}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <span
                              className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${
                                product.is_active
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : "border-gray-200 bg-gray-50 text-gray-600"
                              }`}
                            >
                              {product.is_active ? "Active" : "Hidden"}
                            </span>
                            {product.is_featured && (
                              <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
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
                                  unitLabel: product.unit_label,
                                  imageUrl: product.image_url ?? "",
                                  stockQty: product.stock_qty,
                                  isActive: product.is_active,
                                  isFeatured: product.is_featured,
                                })
                              }
                            >
                              <Edit />
                              Edit
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
          </section>
        </div>
      )}
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
