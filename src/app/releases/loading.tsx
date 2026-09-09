import { SurfaceLoading } from '@/components/primitives/SurfaceLoading';

/** Named by the surface that knows what it is reading. */
export default function Loading() {
  return <SurfaceLoading reading="the corpus source, for each line’s release history." />;
}
