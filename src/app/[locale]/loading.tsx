import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="container space-y-6 py-10" role="status" aria-busy="true">
      <Skeleton className="h-10 w-2/3 max-w-lg" />
      <Skeleton className="h-5 w-1/2 max-w-md" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="aspect-[4/5] w-full" />)}</div>
    </div>
  );
}
