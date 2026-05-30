import { Skeleton, SkeletonShell } from "@/components/skeleton";

export default function Loading() {
  return (
    <SkeletonShell>
      <Skeleton className="h-6 w-32 mb-4" />
      <Skeleton className="h-10 w-full mb-4" />
      <div className="bg-white border rounded-lg divide-y">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="px-4 py-3 flex justify-between items-center">
            <div className="flex-1">
              <Skeleton className="h-4 w-32 mb-2" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-5 w-16" />
          </div>
        ))}
      </div>
    </SkeletonShell>
  );
}
