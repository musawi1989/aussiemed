import { db } from "@/lib/db";
import { CategoryTree } from "@/components/CategoryTree";

export default async function AdminCategoriesPage() {
  const [categories, links] = await Promise.all([
    db.category.findMany({
      orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }],
      select: { id: true, name: true, slug: true, parentId: true },
    }),
    // Active products only: the count here is the one that decides whether a
    // category appears in the storefront menu, so it has to be the same count.
    db.productCategory.findMany({
      where: { product: { status: "Active" } },
      select: { categoryId: true },
    }),
  ]);

  const count = new Map<string, number>();
  for (const link of links) {
    count.set(link.categoryId, (count.get(link.categoryId) ?? 0) + 1);
  }

  const tree = categories
    .filter((c) => c.parentId === null)
    .map((dept) => ({
      id: dept.id,
      name: dept.name,
      slug: dept.slug,
      productCount: count.get(dept.id) ?? 0,
      children: categories
        .filter((c) => c.parentId === dept.id)
        .map((child) => ({
          id: child.id,
          name: child.name,
          slug: child.slug,
          productCount: count.get(child.id) ?? 0,
          children: [],
        })),
    }));

  // Removable, not merely bare. A department showing no direct products is not
  // empty if a subcategory under it is stocked, and counting it as such here
  // would put a number on this screen that disagrees with the one on the button
  // below it.
  const removable = tree.reduce((n, dept) => {
    const goingChildren = dept.children.filter((c) => c.productCount === 0);
    const deptGoes =
      dept.productCount === 0 && goingChildren.length === dept.children.length;
    return n + goingChildren.length + (deptGoes ? 1 : 0);
  }, 0);

  return (
    <>
      <div className="mt-6">
        <h1 className="text-xl font-bold tracking-tight text-text">Categories</h1>
        <p className="mt-1 text-sm text-text-muted tnum">
          {categories.length} categories in {tree.length} departments &middot;{" "}
          {removable} hold nothing and can be removed
        </p>
      </div>

      <CategoryTree tree={tree} />
    </>
  );
}
