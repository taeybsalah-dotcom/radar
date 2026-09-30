import indexHandler from './onboarding/index.ts';

export default async function handler(req: any, res: any) {
  return indexHandler(req, res);
}
