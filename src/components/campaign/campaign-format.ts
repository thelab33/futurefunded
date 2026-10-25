export const formatCampaignMoney = (amount: number) => new Intl.NumberFormat("en-US", {
  style:"currency",currency:"USD",minimumFractionDigits:Number.isInteger(amount)?0:2,maximumFractionDigits:2,
}).format(amount);
