import { authHandler } from "@/modules/auth/service";

export const GET = (req: Request) => authHandler(req);
export const POST = (req: Request) => authHandler(req);
