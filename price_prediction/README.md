#Price Prediction

##Requirements

The following python packages are required to get things to work:

```
scipy==0.18.1
pandas==0.18.0
numpy==1.11.2
statsmodels==0.6.1
```

The following python packages are optional, but recommended, so that you can debug your models:

`matplotlib==1.5.1`

These optional dependencies can be found in requirements-dev.txt

##Justification of requirements

`statsmodels==0.6.1` - This is the heart of the application.  It has the time series model, which is used for price prediction.  

`scipy==0.18.1, pandas==0.18.0, numpy==1.11.2` - these three packages are dependencies for statsmodels.  

##How the requirements are used

In this section, we'll walk through specifically what parts of the packages that get used.  This way, if these dependencies become stale, either because compliance reasons or other issues, you'll know what you can update.  And what cannot be updated.

```python
from scipy import stats
import pandas as pd
import matplotlib.pyplot as plt
import statsmodels.api as sm
from scipy.optimize import brute
```

The above gives some insight into how the code is used.  Specifically, `scipy.optimize`'s `brute` method.  This method runs a brute force algorithm against a function passed in.  [Here are the docs for `brute`](https://docs.scipy.org/doc/scipy-0.18.1/reference/generated/scipy.optimize.brute.html). 

Other than the brute method, which might be subject to change.  The rest of the code takes advantage of the basic utility of each of the above packages and is therefore unlikely to change.

##Explanation of codebase

This code is currently defined in the [data_analysis branch in the price_prediction subapp](https://github.com/18F/calc/tree/data_analysis/price_prediction). The additions to the code base represents a complete prototype - a data visualization, mathematical model with parameter tuning, and a set of data cleaning routines.  The data visualization comes from the [c3.js](http://c3js.org/) library, a high level, minimal data visualization library, built ontop of [d3.js](https://d3js.org/).  The mathematical model is called the AutoRegressive Integrated Moving Average model, or ARIMA for short.  Typically the ARIMA model is tuned manually via inspection of the partical autocorrelation function and autocorrelation functions associated with a given timeseries.  However by making use of the Akaike Information Criterion, shorted to AIC, and a simple hill climb algorithm, we are able to find hyper parameters to fit the curve.  Therefore no manual tunning is required.  The data cleaning techniques are typical and therefore will not be discussed in detail at this point.

The ARIMA model is the main value add of the prototype.  In fact, the ARIMA model is made of up two simpler models, the AutoRegressive model and the Moving Average model.  The the Moving Average is the easier of the two models to explain, so we'll begin with it.  

Implementing the MA model from scratch:

```python
import statistics as stat

def moving_average(data, sliding_window=2):
    averages = []
    terminal_condition = False
    start = 0
    end = sliding_window
    while end != len(data):
        averages.append(stat.mean(data[start:end]))
        start += 1
        end += 1
    return averages
```

As you can see above, we simply define a sliding window, and then take the average of the data incrementing over the index as we go.  Unfortunately the AutoRegressive piece is slightly harder to define.  For this, we'll need to bring in the statsmodels library and it's main work horse - linear regression.

```python
import statsmodels.api as sm

def autoregressive(data):
    Y = data[1:]
    X = data[:-1]
    model = sm.OLS(X,Y)
    result = model.fit()
    return [result.predict(x) for x in X]
```

The autoregressive model treats y_hat, the predicted value for the next data point, as it is correlated to the previous value.  Thus the AutoRegressive model assumes that each value is correlated, with the value in the previous time.

Both of the models we described above, are MA(1) and AR(1) processes - probabilistic mathematical equations, that occur over time.  The hyper parameters are more generally referred to as p and q, respectively.  The hyper parameter, p, refers to the size of the sliding window in the moving average process.  Where as the hyper parameter, q, refers to the number of terms to depend the next element in the series on, in the autoregressive process.  So if we are looking at an AR(2) process - we'd do the following:

```python
def autoregressive(data):
    Y = data[2:]
    X = [[elem, data[ind+1]] for ind,elem enumerate(data) if elem != data[-1]]

    model = sm.OLS(X,Y)
    result = model.fit()
    return [result.predict(x) for x in X]
```

Notice, now we predict the next result on the previous 2.  

The Integrated part of the ARIMA model, simply differences away individual observations, increasing the search space of the model, but allowing the model an increased sense of flexibility.

If you are interested in learning more about the ARIMA model or statistical modeling more generally, from scratch, check out this great resource:

[Statistics class at penn state](https://onlinecourses.science.psu.edu/stat501/node/358)

##Making use of the ARIMA model  

Now that we understand what the ARIMA model is, let's see how to put the interface into practice.

```python
from datetime import datetime
import pandas as pd
from functools import partial

def objective_function(data, order):
    return sm.tsa.ARIMA(data, order).fit().aic

def brute_search(data):
    obj_func = partial(objective_function, data)
    upper_bound_AR = 4
    upper_bound_I = 4
    upper_bound_MA = 4
    grid = (
        slice(1, upper_bound_AR, 1),
        slice(1, upper_bound_I, 1),
        slice(1, upper_bound_MA, 1)
    )
    order = brute(obj_func, grid, finish=None)
    return order, obj_func(order)


df = pd.DataFrame()

for _ in range(200):
    df = df.append({
        "Date": datetime(year=random.randint(2002, 2012), month=random.randint(1,13), day=1),
        "Value": random.randint(0,100000)
        }, ignore_index=True)
    print("created dataframe")
    df["Date"] = pd.to_datetime(df["Date"])
    df = df.set_index("Date")
    df.sort_index(inplace=True)

model_order = brute_search(df)
model = sm.tsa.ARIMA(df, model_order).fit()
prediction = model.predict(0, len(df))
forecast = model.forecast(steps=10)
print(prediction)
print(forecast)
```

In order to tune the hyper parameters, p - AR, d - Integrated, and q - MA; we apply a hill climb algorithm.  This algorithm checks the resulting ARIMA model's [AIC](https://en.wikipedia.org/wiki/Akaike_information_criterion).  The set of hyper parameters that return the most minimal AIC are the hyper parameters chosen. 

Once the hyper parameters are chosen we simply run the model and then get our forecast.  The forecast method, predicts n equally spaced time steps into the future.  Where as the predict method fits the model to the same time intervals as the data.  Therefore exact spacing is not needed for predict, only for forecast.

Once we have our prediction, we are free to save the results to a database and then call them, as needed for our views.  

##Understanding the details

###Problems with the data sets

1. **The timestamps may not be completely meaningful.**  The timestamps associated with the data sets are the first year prices of the contract.  These negoiated hourly rates aren't the dates these contracts are negoiated, but instead, are the start dates of the contracts.  It's unclear if start date of the contract, is an acceptable time stamp for the contracts.  The data _seems_ to be fine, based on the fact that the start date, and the negoiated starting hourly rate are negoiated at the same time.  However, this may not actually make for a good starting time stamp.  In future datasets, we may want to consider adding a different timestamp for the start date - the date the contract was negoiated.  
2.  **The timestamps are not evening distributed.**  This makes predicting into the future with the current interface, using the actual timestamps, impossible.  To compensate for this I've added an interpolation method that adds intermediate values, every month.  Then the original values are removed and the prediction takes place over the interpolated values.  Here's the code that does that:

```python
import datetime

def date_range_generate(start,end):
    start_year = int(start.year)
    start_month = int(start.month)
    end_year = int(end.year)
    end_month = int(end.month)
    dates = [datetime.datetime(year=start_year, month=month, day=1) for month in range(start_month, 13)]
    for year in range(start_year+1, end_year+1):
        dates += [datetime.datetime(year=year, month=month, day=1) for month in range(1,13)]
    return dates

def interpolate(series):
    date_list = list(series.index)
    date_list.sort()
    dates = date_range_generate(date_list[0], date_list[-1])
    for date in dates:
        if date not in list(series.index):
            series = series.set_value(date, np.nan)
    series = series.interpolate(method="values")
    to_remove = [elem for elem in list(series.index) if elem.day != 1]
    series.drop(to_remove, inplace=True)
    return series
```

Note that the series in this case is a pandas series.

3. **Some of the data is wrong**.  Some of the values in the dataset were input wrong and therefore make any predictions less useful.  To deal with this a short term fix has been developed:

```python
def check_for_extreme_values(sequence, sequence_to_check=None):
    mean = statistics.mean(sequence)
    stdev = statistics.stdev(sequence)
    if sequence_to_check is not None:
        for val in sequence_to_check:
            if val >= mean + (stdev*2):
                sequence_to_check.remove(val)
            elif val <= mean - (stdev*2):
                sequence_to_check.remove(val)
        return sequence_to_check
    else:
        for val in sequence:
            if val >= mean + (stdev*2):
                sequence.remove(val)
            elif val <= mean - (stdev*2):
                sequence.remove(val)
        return sequence
```

4. **Some timestamps are repeated.**  Some of the timestamps are repeated in the timeseries.  This means the model tries to predict multiple outputs for a single input.  And it's unclear how the model handles this.  To deal with that, I wrote a method that cleans the dataset:

```python
def clean_data(data):
    new_data = pd.DataFrame()
    for timestamp in set(data.index):
        if len(data.ix[timestamp]) > 1:
            tmp_df = data.ix[timestamp].copy()
            new_price = statistics.median([tmp_df.iloc[index]["Price"] for index in range(len(tmp_df))])
            series = tmp_df.iloc[0]
            series["Price"] = new_price
            new_data = new_data.append(series)
        else:
            new_data = new_data.append(data.ix[timestamp])
    return new_data
```




