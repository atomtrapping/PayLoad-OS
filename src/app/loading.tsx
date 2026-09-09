import { SurfaceLoading } from '@/components/primitives/SurfaceLoading';

/**
 * The fallback for a segment with no loading state of its own. It cannot know
 * which surface it is standing in for, so it names no source it has not been
 * told about; the surfaces whose wait is worth naming carry their own.
 */
export default function Loading() {
  return <SurfaceLoading reading="Reading from the current source." />;
}
