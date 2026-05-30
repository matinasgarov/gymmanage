import { Skeleton, SkeletonShell } from "@/components/skeleton";

export default function Loading() {
  return (
    <SkeletonShell>
      <Skeleton className="h-6 w-32 mb-6" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <Skeleton className="h-56 mb-4" />
      <Skeleton className="h-48" />
    </SkeletonShell>
  );
}
