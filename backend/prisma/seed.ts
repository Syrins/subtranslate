import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create plans
  await prisma.plan.upsert({
    where: { id: 'free' },
    update: {},
    create: {
      id: 'free',
      name: 'Free Plan',
      maxProjects: 3,
      maxVideoSizeMB: 100,
      retentionDays: 7,
      allowWatermark: false,
      allowMultiAudio: false,
      translationQuota: 10,
    },
  });

  await prisma.plan.upsert({
    where: { id: 'pro' },
    update: {},
    create: {
      id: 'pro',
      name: 'Pro Plan',
      maxProjects: 20,
      maxVideoSizeMB: 500,
      retentionDays: 30,
      allowWatermark: true,
      allowMultiAudio: true,
      translationQuota: 100,
    },
  });

  await prisma.plan.upsert({
    where: { id: 'enterprise' },
    update: {},
    create: {
      id: 'enterprise',
      name: 'Enterprise Plan',
      maxProjects: 999,
      maxVideoSizeMB: 2000,
      retentionDays: 365,
      allowWatermark: true,
      allowMultiAudio: true,
      translationQuota: 999999,
    },
  });

  console.log('Seeding completed!');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
