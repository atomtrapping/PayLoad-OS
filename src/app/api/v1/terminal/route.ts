import { terminalHttp } from '../_lib';
import { configuredTerminalService } from '@/terminal/runtime';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) { return terminalHttp(request, configuredTerminalService); }
