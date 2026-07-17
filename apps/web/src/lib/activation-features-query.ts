import { Op, type WhereOptions } from 'sequelize';
import { getSequelize } from '@cd-v2/database';
import { ACTIVATION_FEATURES } from '@/lib/license-constants';

/** Sequelize filter: clients with at least one activation feature selected */
export function activationFeaturesWhereOptions(): WhereOptions {
  const sequelize = getSequelize();
  const featuresText = sequelize.cast(sequelize.col('features'), 'TEXT');

  return {
    [Op.or]: ACTIVATION_FEATURES.map((feature) =>
      sequelize.where(featuresText, { [Op.like]: `%"${feature}"%` })
    ),
  };
}
